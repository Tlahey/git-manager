import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@git-manager/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))

const { apiCopyCommitSha, apiCherryPickCommit, apiGetCommitWebUrl, apiOpenUrl } = vi.hoisted(() => ({
  apiCopyCommitSha: vi.fn(),
  apiCherryPickCommit: vi.fn(),
  apiGetCommitWebUrl: vi.fn(),
  apiOpenUrl: vi.fn(),
}))
vi.mock('../../../api/git.api', () => ({
  apiCopyCommitSha,
  apiCherryPickCommit,
  apiGetCommitWebUrl,
}))
vi.mock('../../../api/shell.api', () => ({ apiOpenUrl }))

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

const INITIAL = useRepoUIStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL, true)
  apiCopyCommitSha.mockResolvedValue(undefined)
  apiCherryPickCommit.mockResolvedValue('newoid')
  apiGetCommitWebUrl.mockResolvedValue('https://github.com/o/r/commit/deadbeefcafe')
  apiOpenUrl.mockResolvedValue(undefined)
  resolveTagOrReleaseUrl.mockResolvedValue('https://github.com/o/r/releases/tag/v1.0')
  useRepoGitHub.mockReturnValue({ ownerRepo: null, token: null })
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
    useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'o', repo: 'r' }, token: 'tok' })
    const cmd = commands().find((c) => c.id === 'commit-open-tag')!
    expect(cmd).toBeTruthy()
    expect(cmd.subtitle).toBe('v1.0')
    cmd.run()
    expect(resolveTagOrReleaseUrl).toHaveBeenCalledWith('o', 'r', 'v1.0', 'tok')
    await vi.waitFor(() => {
      expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/o/r/releases/tag/v1.0')
    })
  })

  it('omits the open-tag command when the tag is known but the repo is not on GitHub', () => {
    useRepoUIStore.setState({ selectedCommitOid: 'deadbeefcafe', activeRepo: '/repo' })
    useCommitTag.mockReturnValue('v1.0')
    useRepoGitHub.mockReturnValue({ ownerRepo: null, token: null })
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
