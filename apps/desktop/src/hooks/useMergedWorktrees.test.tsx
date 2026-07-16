import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { GitWorktree } from '@git-manager/git-types'

vi.mock('../api/github.api', () => ({
  fetchClosedPullRequests: vi.fn(),
  fetchCommitMergedPullRequestForBranch: vi.fn(),
}))
vi.mock('../api/worktree.api', () => ({ apiGoneUpstreamBranches: vi.fn() }))

import { fetchClosedPullRequests, fetchCommitMergedPullRequestForBranch } from '../api/github.api'
import { apiGoneUpstreamBranches } from '../api/worktree.api'
import { useSettingsStore } from '../stores/settings.store'
import { useMergedWorktrees } from './useMergedWorktrees'

const mockedFetch = fetchClosedPullRequests as unknown as ReturnType<typeof vi.fn>
const mockedCommitPr = fetchCommitMergedPullRequestForBranch as unknown as ReturnType<typeof vi.fn>
const mockedGone = apiGoneUpstreamBranches as unknown as ReturnType<typeof vi.fn>
const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/tmp/repo-linked',
    branch: 'feature/login',
    commitOid: 'abc123',
    isMain: false,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
    ...overrides,
  }
}

function closedPr(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: 'Some PR',
    head: { ref: 'feature/login' },
    merged_at: '2024-01-01',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no branch has a gone upstream, and no commit has an associated PR — individual tests
  // override to exercise each signal.
  mockedGone.mockResolvedValue([])
  mockedCommitPr.mockResolvedValue(null)
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

describe('useMergedWorktrees — GitHub remote/token detection', () => {
  it('reports isGithub false and never fetches when no remote matches GitHub', () => {
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [worktree()], ['https://gitlab.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    expect(result.current.isGithub).toBe(false)
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('reports hasToken false and never fetches when there is no token anywhere', () => {
    const { result } = renderHook(
      () =>
        useMergedWorktrees('/repo', [worktree()], ['https://github.com/org/repo.git'], undefined, true),
      { wrapper }
    )
    expect(result.current.isGithub).toBe(true)
    expect(result.current.hasToken).toBe(false)
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('resolves the token from the active GitHub account when not explicitly given', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        github: {
          accounts: [
            {
              id: 'acc1',
              token: 'account-tok',
              user: { login: 'account-user', name: null, email: null, avatarUrl: '' },
            },
          ],
          activeAccountId: 'acc1',
        },
      },
    })
    mockedFetch.mockResolvedValue([closedPr()])
    renderHook(
      () =>
        useMergedWorktrees(
          '/repo',
          [worktree()],
          ['https://github.com/org/repo.git'],
          undefined,
          true
        ),
      { wrapper }
    )
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith('org', 'repo', 'account-tok'))
  })

  it('does not fetch when enabled is false', () => {
    renderHook(
      () =>
        useMergedWorktrees('/repo', [worktree()], ['https://github.com/org/repo.git'], 'tok', false),
      { wrapper }
    )
    expect(mockedFetch).not.toHaveBeenCalled()
  })
})

describe('useMergedWorktrees — filtering', () => {
  it('fetches the closed-PR list once regardless of how many worktrees are checked', async () => {
    mockedFetch.mockResolvedValue([
      closedPr({ head: { ref: 'feature/a' } }),
      closedPr({ number: 2, head: { ref: 'feature/b' } }),
    ])
    const a = worktree({ path: '/tmp/a', branch: 'feature/a' })
    const b = worktree({ path: '/tmp/b', branch: 'feature/b' })
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [a, b], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedWorktrees).toHaveLength(2))
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('excludes dirty worktrees without ever checking GitHub for them', async () => {
    mockedFetch.mockResolvedValue([closedPr({ head: { ref: 'feature/dirty' } })])
    const clean = worktree({ path: '/tmp/clean', branch: 'feature/clean' })
    const dirty = worktree({ path: '/tmp/dirty', branch: 'feature/dirty', isDirty: true })
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [clean, dirty], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    expect(result.current.mergedWorktrees).toEqual([])
  })

  it('excludes detached-HEAD worktrees without a branch to look up', async () => {
    mockedFetch.mockResolvedValue([closedPr({ head: { ref: 'feature/x' } })])
    const onBranch = worktree({ path: '/tmp/on-branch', branch: 'feature/x' })
    const detached = worktree({ path: '/tmp/detached', branch: '(detached HEAD)' })
    const { result } = renderHook(
      () =>
        useMergedWorktrees(
          '/repo',
          [onBranch, detached],
          ['https://github.com/org/repo.git'],
          'tok',
          true
        ),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedWorktrees).toHaveLength(1))
    expect(result.current.mergedWorktrees[0].path).toBe('/tmp/on-branch')
  })

  it('excludes worktrees whose branch has no matching closed PR', async () => {
    mockedFetch.mockResolvedValue([closedPr({ head: { ref: 'feature/other' } })])
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [worktree()], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    expect(result.current.mergedWorktrees).toEqual([])
  })

  it('excludes worktrees whose branch matches a closed but unmerged PR', async () => {
    mockedFetch.mockResolvedValue([closedPr({ merged_at: null })])
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [worktree()], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled())
    expect(result.current.mergedWorktrees).toEqual([])
  })

  it('includes a worktree whose branch matches a merged closed PR', async () => {
    mockedFetch.mockResolvedValue([closedPr()])
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [worktree()], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedWorktrees).toHaveLength(1))
  })

  it('reports isLoading true only while the check is in flight', async () => {
    let resolveFetch: (v: ReturnType<typeof closedPr>[]) => void = () => {}
    mockedFetch.mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)))
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [worktree()], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    expect(result.current.isLoading).toBe(true)
    resolveFetch([closedPr()])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('is never loading when there are no worktrees to check', () => {
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    expect(result.current.isLoading).toBe(false)
    expect(result.current.mergedWorktrees).toEqual([])
  })
})

describe('useMergedWorktrees — per-worktree checks', () => {
  it('gives every worktree its own status, one entry per input, in order', async () => {
    mockedFetch.mockResolvedValue([closedPr({ head: { ref: 'feature/merged' } })])
    const merged = worktree({ path: '/tmp/merged', branch: 'feature/merged' })
    const dirty = worktree({ path: '/tmp/dirty', branch: 'feature/dirty', isDirty: true })
    const detached = worktree({ path: '/tmp/detached', branch: '(detached HEAD)' })
    const noMatch = worktree({ path: '/tmp/no-match', branch: 'feature/no-match' })
    const { result } = renderHook(
      () =>
        useMergedWorktrees(
          '/repo',
          [merged, dirty, detached, noMatch],
          ['https://github.com/org/repo.git'],
          'tok',
          true
        ),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.checks).toHaveLength(4)
    expect(result.current.checks[0]).toEqual({
      worktree: merged,
      status: { merged: { number: 1, title: expect.any(String) } },
    })
    expect(result.current.checks[1]).toEqual({ worktree: dirty, status: 'dirty' })
    expect(result.current.checks[2]).toEqual({ worktree: detached, status: 'detached' })
    expect(result.current.checks[3]).toEqual({ worktree: noMatch, status: 'no-match' })
  })

  it('reports every check as "checking" while the fetch is in flight', () => {
    mockedFetch.mockReturnValue(new Promise(() => {}))
    const wt = worktree()
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [wt], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    expect(result.current.checks).toEqual([{ worktree: wt, status: 'checking' }])
  })
})

describe('useMergedWorktrees — gone-upstream local signal', () => {
  it('includes a worktree whose branch upstream is gone, even with no matching PR', async () => {
    mockedFetch.mockResolvedValue([]) // no PRs
    mockedGone.mockResolvedValue(['feature/local'])
    const wt = worktree({ path: '/tmp/local', branch: 'feature/local' })
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [wt], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedWorktrees).toHaveLength(1))
    expect(result.current.checks[0].status).toBe('branch-gone')
    expect(mockedGone).toHaveBeenCalledWith('/repo')
  })

  it('detects a gone-upstream worktree even without a GitHub token (no PR fetch)', async () => {
    mockedGone.mockResolvedValue(['feature/login'])
    const wt = worktree({ branch: 'feature/login' })
    const { result } = renderHook(
      () =>
        useMergedWorktrees('/repo', [wt], ['https://github.com/org/repo.git'], undefined, true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedWorktrees).toHaveLength(1))
    expect(result.current.checks[0].status).toBe('branch-gone')
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('does not flag a worktree whose branch is not in the gone-upstream set', async () => {
    mockedFetch.mockResolvedValue([])
    mockedGone.mockResolvedValue(['some/other-branch'])
    const wt = worktree({ branch: 'feature/login' })
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [wt], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.checks[0].status).toBe('no-match')
    expect(result.current.mergedWorktrees).toEqual([])
  })

  it('prefers the PR status over the gone-upstream signal when both fire', async () => {
    mockedFetch.mockResolvedValue([closedPr()]) // feature/login merged in PR #1
    mockedGone.mockResolvedValue(['feature/login']) // also gone upstream
    const wt = worktree({ branch: 'feature/login' })
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [wt], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedWorktrees).toHaveLength(1))
    expect(result.current.checks[0].status).toEqual({
      merged: { number: 1, title: expect.any(String) },
    })
  })
})

describe('useMergedWorktrees — commit → pull request signal', () => {
  it('flags a worktree whose HEAD commit belongs to a merged PR of its own branch', async () => {
    mockedFetch.mockResolvedValue([]) // no name match
    mockedGone.mockResolvedValue([]) // no gone upstream
    mockedCommitPr.mockResolvedValue({ number: 42, title: 'feat: thing' })
    const wt = worktree({ branch: 'feature/x', commitOid: 'sha-abc' })
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [wt], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedWorktrees).toHaveLength(1))
    expect(result.current.checks[0].status).toEqual({ merged: { number: 42, title: 'feat: thing' } })
    // The worktree's own branch is passed so the API can reject other branches' PRs.
    expect(mockedCommitPr).toHaveBeenCalledWith('org', 'repo', 'sha-abc', 'feature/x', 'tok')
  })

  it('does not flag a worktree when no merged PR matches its branch (fork-point commit case)', async () => {
    mockedFetch.mockResolvedValue([])
    mockedGone.mockResolvedValue([])
    mockedCommitPr.mockResolvedValue(null)
    const wt = worktree()
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [wt], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.checks[0].status).toBe('no-match')
    expect(result.current.mergedWorktrees).toEqual([])
  })

  it('prefers the commit-PR match over the gone-upstream signal when both fire', async () => {
    mockedFetch.mockResolvedValue([])
    mockedGone.mockResolvedValue(['feature/x']) // gone upstream too
    mockedCommitPr.mockResolvedValue({ number: 7, title: 'fix: y' })
    const wt = worktree({ branch: 'feature/x' })
    const { result } = renderHook(
      () => useMergedWorktrees('/repo', [wt], ['https://github.com/org/repo.git'], 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedWorktrees).toHaveLength(1))
    expect(result.current.checks[0].status).toEqual({ merged: { number: 7, title: 'fix: y' } })
  })
})
