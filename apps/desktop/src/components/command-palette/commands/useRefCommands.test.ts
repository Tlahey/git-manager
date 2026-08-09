import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitBranch, GitRef } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('@git-manager/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const invalidateQueries = vi.fn()
const { tagsQuery } = vi.hoisted(() => ({ tagsQuery: { current: [] as GitRef[] } }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
  useQuery: () => ({ data: tagsQuery.current }),
}))

const { branchesQuery } = vi.hoisted(() => ({ branchesQuery: { current: [] as GitBranch[] } }))
vi.mock('../../../hooks/useBranches', () => ({
  useBranches: () => ({ data: branchesQuery.current }),
}))

const {
  apiGetTags,
  apiMergeBranch,
  apiFastForwardBranch,
  apiPushTag,
  apiDeleteTag,
  apiDeleteBranch,
} = vi.hoisted(() => ({
  apiGetTags: vi.fn(),
  apiMergeBranch: vi.fn(),
  apiFastForwardBranch: vi.fn(),
  apiPushTag: vi.fn(),
  apiDeleteTag: vi.fn(),
  apiDeleteBranch: vi.fn(),
}))
vi.mock('../../../api/git.api', () => ({
  apiGetTags,
  apiMergeBranch,
  apiFastForwardBranch,
  apiPushTag,
  apiDeleteTag,
  apiDeleteBranch,
}))

import { useRefCommands } from './useRefCommands'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoViewStore } from '../../../stores/repoView.store'

const REPO = '/repo'
const INITIAL_UI = useRepoUIStore.getState()
const INITIAL_DATA = useRepoDataStore.getState()

/**
 * A branch as the backend really shapes it: for a remote, `name` keeps the remote prefix
 * (`origin/feat`) and `shortName` has it stripped (`feat`) — see `services/git_branch.rs`.
 */
function branch(shortName: string, remote?: string): GitBranch {
  const isRemote = !!remote
  return {
    name: isRemote ? `${remote}/${shortName}` : shortName,
    shortName,
    isHead: false,
    isRemote,
    commitOid: `oid-${shortName}`,
    commitMessage: 'msg',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

function tag(shortName: string): GitRef {
  return {
    name: `refs/tags/${shortName}`,
    shortName,
    type: 'tag',
    commitOid: `oid-${shortName}`,
  }
}

/** Puts an active repo on a branch, with the given refs loaded. */
function setup({
  head = 'main',
  isDetached = false,
  branches = [] as GitBranch[],
  tags = [] as GitRef[],
} = {}) {
  branchesQuery.current = branches
  tagsQuery.current = tags
  useRepoUIStore.setState({ activeRepo: REPO })
  useRepoDataStore.setState({
    repoCache: {
      [REPO]: {
        path: REPO,
        name: 'repo',
        head,
        isDetached,
        isDirty: false,
        remotes: [],
      },
    },
  })
  const { result } = renderHook(() => useRefCommands())
  return result.current
}

const ids = (cmds: { id: string }[]) => cmds.map((c) => c.id)
const byId = (cmds: { id: string; run: () => void }[], id: string) => cmds.find((c) => c.id === id)!

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL_UI, true)
  useRepoDataStore.setState(INITIAL_DATA, true)
  useRepoViewStore.setState({ view: 'graph', isPanelOpen: true })
  branchesQuery.current = []
  tagsQuery.current = []
  apiMergeBranch.mockResolvedValue(undefined)
  apiFastForwardBranch.mockResolvedValue(undefined)
  apiPushTag.mockResolvedValue(undefined)
  apiDeleteTag.mockResolvedValue(undefined)
  apiDeleteBranch.mockResolvedValue(undefined)
})

describe('useRefCommands — gating', () => {
  it('returns nothing without an active repo', () => {
    const { result } = renderHook(() => useRefCommands())
    expect(result.current).toEqual([])
  })

  it('offers no merge or fast-forward for the branch already checked out', () => {
    const cmds = setup({ head: 'main', branches: [branch('main'), branch('feat')] })
    expect(ids(cmds)).toContain('ref-merge-feat')
    expect(ids(cmds)).not.toContain('ref-merge-main')
  })

  // Merge and fast-forward are relative to HEAD, so a detached HEAD has nothing to merge *into* —
  // the native menus gate on the same condition.
  it('offers no merge or fast-forward on a detached HEAD, but still offers the tag actions', () => {
    const cmds = setup({ isDetached: true, branches: [branch('feat')], tags: [tag('v1.0')] })
    expect(ids(cmds).filter((id) => id.startsWith('ref-merge'))).toEqual([])
    expect(ids(cmds).filter((id) => id.startsWith('ref-fast-forward'))).toEqual([])
    expect(ids(cmds)).toContain('ref-push-tag-v1.0')
  })
})

describe('useRefCommands — branch actions', () => {
  it('merges the named branch into the current one', () => {
    const cmds = setup({ head: 'main', branches: [branch('feat')] })
    byId(cmds, 'ref-merge-feat').run()
    expect(apiMergeBranch).toHaveBeenCalledWith(REPO, 'feat', 'main')
  })

  it('fast-forwards the current branch to the named one', () => {
    const cmds = setup({ head: 'main', branches: [branch('feat')] })
    byId(cmds, 'ref-fast-forward-feat').run()
    expect(apiFastForwardBranch).toHaveBeenCalledWith(REPO, 'feat', 'main')
  })

  // Destructive on someone else's clone too: this one opens the confirmation the menus open,
  // rather than deleting outright.
  // Never offered for the branch you are on: git refuses to delete the branch HEAD points at.
  it('deletes a local branch through the undo-recording wrapper, with its tip oid', () => {
    const cmds = setup({ head: 'main', branches: [branch('feat'), branch('main')] })
    expect(ids(cmds)).not.toContain('ref-delete-branch-main')
    byId(cmds, 'ref-delete-branch-feat').run()
    expect(apiDeleteBranch).toHaveBeenCalledWith(REPO, 'feat', { targetOid: 'oid-feat' })
  })

  it('deleting a remote branch opens the confirmation, split into remote + branch', () => {
    const cmds = setup({ branches: [branch('feat/login', 'origin')] })
    byId(cmds, 'ref-delete-remote-branch-origin/feat/login').run()
    expect(useRepoUIStore.getState().pendingRemoteBranchDelete).toEqual({
      remote: 'origin',
      branchName: 'feat/login',
    })
  })
})

describe('useRefCommands — tag actions', () => {
  it('pushes a tag', () => {
    const cmds = setup({ tags: [tag('v1.0')] })
    byId(cmds, 'ref-push-tag-v1.0').run()
    expect(apiPushTag).toHaveBeenCalledWith(REPO, 'v1.0')
  })

  it('deletes a local tag through the undo-recording wrapper, with its target oid', () => {
    const cmds = setup({ tags: [tag('v1.0')] })
    byId(cmds, 'ref-delete-tag-v1.0').run()
    expect(apiDeleteTag).toHaveBeenCalledWith(REPO, 'v1.0', { targetOid: 'oid-v1.0' })
  })

  it('deleting a remote tag opens the confirmation rather than deleting outright', () => {
    const cmds = setup({ tags: [tag('v1.0')] })
    byId(cmds, 'ref-delete-remote-tag-v1.0').run()
    expect(useRepoUIStore.getState().pendingTagDialog).toEqual({
      kind: 'deleteRemote',
      tagName: 'v1.0',
      oid: 'oid-v1.0',
      remote: 'origin',
    })
  })
})

// The palette opens on any view. Everything that moves the repository shows its result on the graph,
// so running one from the board has to land there — while the two confirmation dialogs are mounted
// outside the view switch and work wherever they are opened from.
describe('useRefCommands — where the result is seen', () => {
  it.each([['ref-merge-feature'], ['ref-fast-forward-feature'], ['ref-delete-branch-feature']])(
    '%s lands on the content view',
    (id) => {
      const cmds = setup({ branches: [branch('feature')], head: 'main' })
      useRepoViewStore.setState({ view: 'board' })
      byId(cmds, id).run()
      expect(useRepoViewStore.getState().view).toBe('graph')
    }
  )

  it('a remote-tag deletion opens its confirmation without moving the user', () => {
    const cmds = setup({ tags: [tag('v1.0')] })
    useRepoViewStore.setState({ view: 'board' })
    byId(cmds, 'ref-delete-remote-tag-v1.0').run()
    expect(useRepoViewStore.getState().view).toBe('board')
  })
})
