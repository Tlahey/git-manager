import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Real i18n (vitest.setup.ts initialises English) — assertions on ids stay untouched, and the one
// title assertion below checks the real visible copy, interpolation included.
vi.mock('@git-manager/ui', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  // The commit set renders an open-on-GitHub entry, whose icon now comes from our own
  // brand set rather than lucide's deprecated one.
  GithubIcon: () => null,
}))

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

const {
  apiCopyCommitSha,
  apiCherryPickCommit,
  apiGetCommitWebUrl,
  apiOpenUrl,
  apiCreatePatch,
  apiCreateCommitsPatch,
  pickSaveDestination,
} = vi.hoisted(() => ({
  apiCopyCommitSha: vi.fn(),
  apiCherryPickCommit: vi.fn(),
  apiGetCommitWebUrl: vi.fn(),
  apiOpenUrl: vi.fn(),
  apiCreatePatch: vi.fn(),
  apiCreateCommitsPatch: vi.fn(),
  pickSaveDestination: vi.fn(),
}))
vi.mock('../../../api/git.api', () => ({
  apiCopyCommitSha,
  apiCherryPickCommit,
  apiGetCommitWebUrl,
  apiCreatePatch,
  apiCreateCommitsPatch,
}))
vi.mock('../../../api/shell.api', () => ({ apiOpenUrl }))
vi.mock('../../../lib/pickSaveDestination', () => ({ pickSaveDestination }))

const { resolveTagOrReleaseUrl } = vi.hoisted(() => ({ resolveTagOrReleaseUrl: vi.fn() }))
vi.mock('../../../api/github.api', () => ({ resolveTagOrReleaseUrl }))

// Commit-association hooks are exercised in their own tests; stub them here for determinism.
const { useRepoGitHub, useCommitTag, useCommitPullRequest } = vi.hoisted(() => ({
  useRepoGitHub: vi.fn(),
  useCommitTag: vi.fn(),
  useCommitPullRequest: vi.fn(),
}))
vi.mock('../../../hooks/useRepoGitHub', () => ({ useRepoGitHub }))
vi.mock('../../../hooks/useCommitTag', () => ({ useCommitTag }))
vi.mock('../../../hooks/useCommitPullRequest', () => ({ useCommitPullRequest }))

import { useCommitCommands } from './useCommitCommands'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { useRepoViewStore } from '../../../stores/repoView.store'

const INITIAL = useRepoUIStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL, true)
  useRepoViewStore.setState({ view: 'graph', isPanelOpen: true })
  apiCopyCommitSha.mockResolvedValue(undefined)
  apiCherryPickCommit.mockResolvedValue('newoid')
  apiGetCommitWebUrl.mockResolvedValue('https://github.com/o/r/commit/deadbeefcafe')
  apiOpenUrl.mockResolvedValue(undefined)
  apiCreatePatch.mockResolvedValue(undefined)
  apiCreateCommitsPatch.mockResolvedValue(undefined)
  pickSaveDestination.mockResolvedValue('/tmp/e2e.patch')
  resolveTagOrReleaseUrl.mockResolvedValue('https://github.com/o/r/releases/tag/v1.0')
  useRepoGitHub.mockReturnValue({ ownerRepo: null, accountId: null })
  useCommitTag.mockReturnValue(null)
  useCommitPullRequest.mockReturnValue(null)
})

function commands() {
  const { result } = renderHook(() => useCommitCommands())
  return result.current
}

describe('useCommitCommands', () => {
  it('returns nothing when no commit is selected', () => {
    expect(commands()).toEqual([])
  })

  it('returns nothing when a commit is selected but there is no active repo', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: null })
    expect(commands()).toEqual([])
  })

  it('returns nothing when the selected row is a stash entry', () => {
    useRepoUIStore.setState({
      selectedCommitOid: 'deadbeefcafe',
      activeRepo: '/repo',
      selectedStashIndex: 0,
    })
    expect(commands()).toEqual([])
  })

  it('returns the commit action set when a commit is selected', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    const ids = commands().map((c) => c.id)
    expect(ids).toEqual([
      'commit-reset-soft',
      'commit-reset-mixed',
      'commit-reset-hard',
      'commit-revert',
      'commit-branch',
      'commit-tag',
      'commit-tag-annotated',
      'commit-fixup',
      'commit-cherry-pick',
      'commit-create-patch',
      'commit-copy-sha',
      'commit-open-github',
    ])
  })

  it('dialog commands dispatch the matching pendingGraphAction', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    const byId = (id: string) => commands().find((c) => c.id === id)!

    byId('commit-reset-hard').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'reset', mode: 'hard' })

    byId('commit-revert').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'revert' })

    byId('commit-tag-annotated').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'tag', annotated: true })

    byId('commit-branch').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'branch' })

    byId('commit-fixup').run()
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'fixup' })
  })

  it('omits the patch-from-selection command while fewer than two commits are selected', () => {
    useRepoUIStore.setState({
      selectedCommitOid: 'deadbeefcafe',
      activeRepo: '/repo',
      selectedCommitOids: [],
    })
    expect(commands().find((c) => c.id === 'commit-create-patch-selection')).toBeUndefined()
  })

  it('patch-from-selection picks a destination then writes the selection oldest first', async () => {
    useRepoUIStore.setState({
      selectedCommitOid: 'deadbeefcafe',
      activeRepo: '/repo',
      // Newest first, as GitGraph publishes them.
      selectedCommitOids: ['c3newest', 'c2middle', 'c1oldest'],
    })
    const cmd = commands().find((c) => c.id === 'commit-create-patch-selection')!
    expect(cmd).toBeTruthy()
    expect(cmd.title).toBe('Create patch file from the 3 selected commits')
    cmd.run()
    expect(pickSaveDestination).toHaveBeenCalledWith('deadbee-and-2-more.patch')
    await vi.waitFor(() => {
      expect(apiCreateCommitsPatch).toHaveBeenCalledWith(
        '/repo',
        ['c1oldest', 'c2middle', 'c3newest'],
        '/tmp/e2e.patch'
      )
    })
  })

  it('copy-sha copies the full selected oid', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    commands()
      .find((c) => c.id === 'commit-copy-sha')!
      .run()
    expect(apiCopyCommitSha).toHaveBeenCalledWith('deadbeefcafe')
  })

  it('adds an open-PR command with the PR number as subtitle when a PR is associated', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    useCommitPullRequest.mockReturnValue({
      number: 42,
      url: 'https://github.com/o/r/pull/42',
      title: 'Add feature',
      state: 'closed',
      merged: true,
    })
    const cmd = commands().find((c) => c.id === 'commit-open-pr')!
    expect(cmd).toBeTruthy()
    expect(cmd.subtitle).toBe('#42')
    cmd.run()
    expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/o/r/pull/42')
  })

  it('adds an open-tag command that resolves the release/tag URL and opens it', async () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    useCommitTag.mockReturnValue('v1.0')
    useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'o', repo: 'r' }, accountId: 'acct' })
    const cmd = commands().find((c) => c.id === 'commit-open-tag')!
    expect(cmd).toBeTruthy()
    expect(cmd.subtitle).toBe('v1.0')
    cmd.run()
    expect(resolveTagOrReleaseUrl).toHaveBeenCalledWith('o', 'r', 'v1.0', 'acct')
    await vi.waitFor(() => {
      expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/o/r/releases/tag/v1.0')
    })
  })

  it('omits the open-tag command when the tag is known but the repo is not on GitHub', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    useCommitTag.mockReturnValue('v1.0')
    useRepoGitHub.mockReturnValue({ ownerRepo: null, accountId: null })
    expect(commands().find((c) => c.id === 'commit-open-tag')).toBeUndefined()
  })

  it('open-github resolves the commit web URL and opens it', async () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    commands()
      .find((c) => c.id === 'commit-open-github')!
      .run()
    expect(apiGetCommitWebUrl).toHaveBeenCalledWith('/repo', 'deadbeefcafe')
    await vi.waitFor(() => {
      expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/o/r/commit/deadbeefcafe')
    })
  })

  it('cherry-pick calls the API directly and invalidates log/status on success', async () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    commands()
      .find((c) => c.id === 'commit-cherry-pick')!
      .run()
    expect(apiCherryPickCommit).toHaveBeenCalledWith('/repo', 'deadbeefcafe')
    await vi.waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
    })
  })
})

// The bridge's other end is an effect inside `GitGraph`. Dispatching into it from a view that does
// not mount the graph is worse than a no-op: the pending action survives in the store and the dialog
// opens by itself the next time the user comes back to the graph.
describe('useCommitCommands — the graph bridge dispatches from the graph', () => {
  it.each([
    ['commit-reset-soft'],
    ['commit-reset-mixed'],
    ['commit-reset-hard'],
    ['commit-revert'],
    ['commit-branch'],
    ['commit-tag'],
    ['commit-tag-annotated'],
    ['commit-fixup'],
  ])('%s brings the content view forward before setting the pending action', (id) => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    useRepoViewStore.setState({ view: 'board' })

    commands()
      .find((c) => c.id === id)!
      .run()

    expect(useRepoViewStore.getState().view).toBe('graph')
    expect(useRepoUIStore.getState().pendingGraphAction).not.toBeNull()
  })

  it('still carries the action it was asked for', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    useRepoViewStore.setState({ view: 'files' })

    commands()
      .find((c) => c.id === 'commit-reset-hard')!
      .run()

    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'reset', mode: 'hard' })
  })
})
