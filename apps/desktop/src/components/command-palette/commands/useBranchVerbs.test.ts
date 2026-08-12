import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitBranch } from '@git-manager/git-types'

vi.mock('@git-manager/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

const { branchesQuery } = vi.hoisted(() => ({ branchesQuery: { current: [] as GitBranch[] } }))
vi.mock('../../../hooks/useBranches', () => ({
  useBranches: () => ({ data: branchesQuery.current }),
}))

const { apiMergeBranch, apiFastForwardBranch, apiDeleteBranch, apiRebaseOntoCommit } = vi.hoisted(
  () => ({
    apiMergeBranch: vi.fn(),
    apiFastForwardBranch: vi.fn(),
    apiDeleteBranch: vi.fn(),
    apiRebaseOntoCommit: vi.fn(),
  })
)
vi.mock('../../../api/git.api', () => ({
  apiMergeBranch,
  apiFastForwardBranch,
  apiDeleteBranch,
  apiRebaseOntoCommit,
}))

// The switch entry points are shared with the sidebar's branch menu (stash prompt included); what
// this suite checks is that the palette calls them, and under which name. Neither takes a path —
// they target the base project, which is `useSwitchBranch`'s own concern and its own test file's.
const { switchBranch, switchRemoteBranch } = vi.hoisted(() => ({
  switchBranch: vi.fn(),
  switchRemoteBranch: vi.fn(),
}))
vi.mock('../../../hooks/useSwitchBranch', () => ({
  useSwitchBranch: () => ({ switchBranch, switchRemoteBranch, basePath: '/repo' }),
}))

import { useBranchVerbs } from './useBranchVerbs'
import type { RefVerb } from './refCommandRows'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoViewStore } from '../../../stores/repoView.store'
import { type RefPickerVerb } from '../../../stores/commandPalette.store'

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

/** Puts an active repo on a branch, with the given branches loaded. */
function setup({ head = 'main', isDetached = false, branches = [] as GitBranch[] } = {}) {
  branchesQuery.current = branches
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
  const { result } = renderHook(() => useBranchVerbs())
  return result.current
}

const verbNames = (verbs: RefVerb[]) => verbs.map((v) => v.verb)
const find = (verbs: RefVerb[], verb: RefPickerVerb) => verbs.find((v) => v.verb === verb)!

/** The branches a verb offers, named the way the palette shows them. */
const candidates = (verbs: RefVerb[], verb: RefPickerVerb) =>
  find(verbs, verb).targets.map((target) => target.name)

/** Applies a verb to one of its branches, by name. */
function apply(verbs: RefVerb[], verb: RefPickerVerb, branchName: string) {
  find(verbs, verb)
    .targets.find((target) => target.name === branchName)!
    .run()
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL_UI, true)
  useRepoDataStore.setState(INITIAL_DATA, true)
  useRepoViewStore.setState({ view: 'graph', isPanelOpen: true })
  branchesQuery.current = []
  apiMergeBranch.mockResolvedValue(undefined)
  apiFastForwardBranch.mockResolvedValue(undefined)
  apiDeleteBranch.mockResolvedValue(undefined)
  apiRebaseOntoCommit.mockResolvedValue(undefined)
  switchBranch.mockResolvedValue(true)
  switchRemoteBranch.mockResolvedValue(true)
})

describe('useBranchVerbs — which verbs exist', () => {
  it('offers none without an active repo', () => {
    const { result } = renderHook(() => useBranchVerbs())
    expect(result.current).toEqual([])
  })

  it('offers the eight branch verbs on a branch with somewhere to go', () => {
    const verbs = setup({
      head: 'main',
      branches: [branch('main'), branch('feat'), branch('feat', 'origin')],
    })
    expect(verbNames(verbs)).toEqual([
      'checkout',
      'merge',
      'fastForward',
      'rebase',
      'compare',
      'deleteBranch',
      'rename',
      'deleteRemoteBranch',
    ])
  })

  // Merge, fast-forward, rebase and compare are relative to HEAD, so a detached HEAD has nothing to
  // merge *into* — the native menus gate on the same condition. Checkout has no such dependency:
  // getting back onto a branch is exactly what a detached HEAD needs.
  it('drops the HEAD-relative verbs on a detached HEAD, keeping checkout and rename', () => {
    const verbs = setup({ isDetached: true, branches: [branch('feat')] })
    expect(verbNames(verbs)).toEqual(['checkout', 'deleteBranch', 'rename', 'deleteRemoteBranch'])
  })

  // An empty candidate list is how `useBranchCommands` knows not to offer the verb at all.
  it('leaves a verb with no candidate branch empty', () => {
    const verbs = setup({ head: 'main', branches: [branch('main')] })
    expect(candidates(verbs, 'merge')).toEqual([])
    expect(candidates(verbs, 'checkout')).toEqual([])
    expect(candidates(verbs, 'deleteRemoteBranch')).toEqual([])
    // Rename is the one verb that accepts the branch you are on: git renames HEAD's branch happily.
    expect(candidates(verbs, 'rename')).toEqual(['main'])
  })
})

describe('useBranchVerbs — what each can act on', () => {
  const branches = [branch('main'), branch('feat'), branch('feat/login', 'origin')]

  // Local and remote in one list: picking `origin/feat` asks for the same thing as picking `feat`.
  it('checks out local and remote branches alike, never the one already checked out', () => {
    expect(candidates(setup({ head: 'main', branches }), 'checkout')).toEqual([
      'feat',
      'origin/feat/login',
    ])
  })

  it('keeps the HEAD-relative verbs to other local branches', () => {
    const verbs = setup({ head: 'main', branches })
    for (const verb of ['merge', 'fastForward', 'rebase', 'compare', 'deleteBranch'] as const) {
      expect(candidates(verbs, verb)).toEqual(['feat'])
    }
  })

  it('offers rename every local branch, the current one included', () => {
    expect(candidates(setup({ head: 'main', branches }), 'rename')).toEqual(['main', 'feat'])
  })

  it('offers remote deletion the remote branches alone', () => {
    expect(candidates(setup({ head: 'main', branches }), 'deleteRemoteBranch')).toEqual([
      'origin/feat/login',
    ])
  })
})

describe('useBranchVerbs — what applying one does', () => {
  it('checks out a local branch through the shared stash-prompting entry point', () => {
    apply(setup({ head: 'main', branches: [branch('feat')] }), 'checkout', 'feat')
    expect(switchBranch).toHaveBeenCalledWith('feat')
  })

  // A remote row switches onto the LOCAL branch of that name, creating it when needed — never the
  // detached form. It is named remote-qualified, which `GitBranch` carries in `name`.
  it('checks out a remote branch as its local counterpart', () => {
    apply(setup({ branches: [branch('feat/login', 'origin')] }), 'checkout', 'origin/feat/login')
    expect(switchRemoteBranch).toHaveBeenCalledWith('origin/feat/login')
    expect(switchBranch).not.toHaveBeenCalled()
  })

  it('merges the named branch into the current one', () => {
    apply(setup({ head: 'main', branches: [branch('feat')] }), 'merge', 'feat')
    expect(apiMergeBranch).toHaveBeenCalledWith(REPO, 'feat', 'main')
  })

  it('fast-forwards the current branch to the named one', () => {
    apply(setup({ head: 'main', branches: [branch('feat')] }), 'fastForward', 'feat')
    expect(apiFastForwardBranch).toHaveBeenCalledWith(REPO, 'feat', 'main')
  })

  // Onto the branch's tip commit, as the branch menus do — a rebase targets a commit.
  it('rebases the current branch onto the named branch tip', () => {
    apply(setup({ head: 'main', branches: [branch('feat')] }), 'rebase', 'feat')
    expect(apiRebaseOntoCommit).toHaveBeenCalledWith(REPO, 'oid-feat')
  })

  it('deletes a local branch through the undo-recording wrapper, with its tip oid', () => {
    apply(setup({ head: 'main', branches: [branch('feat')] }), 'deleteBranch', 'feat')
    expect(apiDeleteBranch).toHaveBeenCalledWith(REPO, 'feat', { targetOid: 'oid-feat' })
  })

  it('compares the named branch against the current one', () => {
    apply(setup({ head: 'main', branches: [branch('feat')] }), 'compare', 'feat')
    expect(useRepoUIStore.getState().compareRefsTarget).toEqual({
      baseRef: 'feat',
      headRef: 'main',
    })
  })

  // The dialog is mounted once by `RepoWorkspace` from this shared slot — the palette and the
  // sidebar's menu open the same one.
  it('renaming a branch opens the shared rename dialog', () => {
    apply(setup({ head: 'main', branches: [branch('feat')] }), 'rename', 'feat')
    expect(useRepoUIStore.getState().pendingBranchRename).toBe('feat')
  })

  // Destructive on someone else's clone too: this one opens the confirmation the menus open,
  // rather than deleting outright.
  it('deleting a remote branch opens the confirmation, split into remote + branch', () => {
    apply(
      setup({ branches: [branch('feat/login', 'origin')] }),
      'deleteRemoteBranch',
      'origin/feat/login'
    )
    expect(useRepoUIStore.getState().pendingRemoteBranchDelete).toEqual({
      remote: 'origin',
      branchName: 'feat/login',
    })
  })
})

// The palette opens on any view. Everything that moves the repository shows its result on the graph,
// so running one from the board has to land there — while the dialogs are mounted outside the view
// switch and work wherever they are opened from.
describe('useBranchVerbs — where the result is seen', () => {
  it.each([['checkout'], ['merge'], ['fastForward'], ['rebase'], ['deleteBranch']] as const)(
    '%s lands on the content view',
    (verb) => {
      const verbs = setup({ head: 'main', branches: [branch('feature')] })
      useRepoViewStore.setState({ view: 'board' })
      apply(verbs, verb, 'feature')
      expect(useRepoViewStore.getState().view).toBe('graph')
    }
  )

  // The comparison and the rename are dialogs mounted outside the view switch: they open on the
  // board as they are, and dragging the user to the graph would be a detour, not a destination.
  it.each([['compare'], ['rename']] as const)(
    '%s opens its dialog without moving the user',
    (verb) => {
      const verbs = setup({ head: 'main', branches: [branch('feature')] })
      useRepoViewStore.setState({ view: 'board' })
      apply(verbs, verb, 'feature')
      expect(useRepoViewStore.getState().view).toBe('board')
    }
  )
})
