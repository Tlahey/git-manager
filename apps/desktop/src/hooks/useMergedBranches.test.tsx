import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { GitBranch } from '@git-manager/git-types'

vi.mock('../api/github.api', () => ({
  fetchClosedPullRequests: vi.fn(),
  fetchCommitMergedPullRequestForBranch: vi.fn(),
}))
vi.mock('../api/worktree.api', () => ({ apiGoneUpstreamBranches: vi.fn() }))

import { fetchClosedPullRequests, fetchCommitMergedPullRequestForBranch } from '../api/github.api'
import { apiGoneUpstreamBranches } from '../api/worktree.api'
import { useSettingsStore } from '../stores/settings.store'
import { useMergedBranches, type BranchMergeCheck } from './useMergedBranches'

const mockedFetch = fetchClosedPullRequests as unknown as ReturnType<typeof vi.fn>
const mockedCommitPr = fetchCommitMergedPullRequestForBranch as unknown as ReturnType<typeof vi.fn>
const mockedGone = apiGoneUpstreamBranches as unknown as ReturnType<typeof vi.fn>
const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return {
    name: 'refs/heads/feature/x',
    shortName: 'feature/x',
    isHead: false,
    isRemote: false,
    commitOid: 'oid-x',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
    ...overrides,
  }
}

const GH = ['https://github.com/org/repo.git']

function statusOf(checks: BranchMergeCheck[], shortName: string) {
  return checks.find((c) => c.branch.shortName === shortName)?.status
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedGone.mockResolvedValue([])
  mockedCommitPr.mockResolvedValue(null)
  mockedFetch.mockResolvedValue([])
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

describe('useMergedBranches — exclusions', () => {
  it('never lists the current HEAD branch or main/master', async () => {
    const branches = [
      branch({ shortName: 'main' }),
      branch({ shortName: 'master' }),
      branch({ shortName: 'feature/x', isHead: true }),
      branch({ shortName: 'feature/y', commitOid: 'oid-y' }),
    ]
    const { result } = renderHook(
      () => useMergedBranches('/repo', branches, [], GH, 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const names = result.current.checks.map((c) => c.branch.shortName)
    expect(names).toEqual(['feature/y'])
  })

  it('lists a worktree-checked-out branch as "worktree" and never as a deletion candidate', async () => {
    mockedGone.mockResolvedValue(['feature/y']) // even if it looks merged
    const branches = [branch({ shortName: 'feature/y', commitOid: 'oid-y' })]
    const { result } = renderHook(
      () => useMergedBranches('/repo', branches, ['feature/y'], GH, 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(statusOf(result.current.checks, 'feature/y')).toBe('worktree')
    expect(result.current.mergedBranches).toEqual([])
  })

  it('excludes remote branches', async () => {
    const branches = [
      branch({ shortName: 'feature/x' }),
      branch({ shortName: 'origin/feature/x', isRemote: true }),
    ]
    const { result } = renderHook(
      () => useMergedBranches('/repo', branches, [], GH, 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.checks.map((c) => c.branch.shortName)).toEqual(['feature/x'])
  })
})

describe('useMergedBranches — merge signals', () => {
  it('flags a branch whose tip commit belongs to a merged PR of its own name', async () => {
    mockedCommitPr.mockResolvedValue({ number: 12, title: 'feat: x' })
    const branches = [branch({ shortName: 'feature/x', commitOid: 'oid-x' })]
    const { result } = renderHook(
      () => useMergedBranches('/repo', branches, [], GH, 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedBranches).toHaveLength(1))
    expect(statusOf(result.current.checks, 'feature/x')).toEqual({
      merged: { number: 12, title: 'feat: x' },
    })
    expect(mockedCommitPr).toHaveBeenCalledWith('org', 'repo', 'oid-x', 'feature/x', 'tok')
  })

  it('flags a branch whose upstream is gone, even without a GitHub token', async () => {
    mockedGone.mockResolvedValue(['feature/x'])
    const branches = [branch({ shortName: 'feature/x' })]
    const { result } = renderHook(
      () => useMergedBranches('/repo', branches, [], GH, undefined, true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedBranches).toHaveLength(1))
    expect(statusOf(result.current.checks, 'feature/x')).toBe('branch-gone')
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('flags a branch matching a merged closed PR by name', async () => {
    mockedFetch.mockResolvedValue([
      { number: 5, title: 'Old PR', head: { ref: 'feature/x' }, merged_at: '2024-01-01' },
    ])
    const branches = [branch({ shortName: 'feature/x' })]
    const { result } = renderHook(
      () => useMergedBranches('/repo', branches, [], GH, 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.mergedBranches).toHaveLength(1))
    expect(statusOf(result.current.checks, 'feature/x')).toEqual({
      merged: { number: 5, title: 'Old PR' },
    })
  })

  it('leaves a branch with no signal as "no-match"', async () => {
    const branches = [branch({ shortName: 'feature/x' })]
    const { result } = renderHook(
      () => useMergedBranches('/repo', branches, [], GH, 'tok', true),
      { wrapper }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(statusOf(result.current.checks, 'feature/x')).toBe('no-match')
    expect(result.current.mergedBranches).toEqual([])
  })
})
