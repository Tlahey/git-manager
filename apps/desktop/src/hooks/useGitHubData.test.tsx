import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/github.api', () => ({
  fetchGitHubPRs: vi.fn(),
  fetchGitHubReviewRequestedPRs: vi.fn(),
  fetchGitHubPRDetails: vi.fn(),
  fetchGitHubCommitCiStatus: vi.fn(),
  fetchGitHubContributions: vi.fn(),
}))

import {
  fetchGitHubPRs,
  fetchGitHubReviewRequestedPRs,
  fetchGitHubPRDetails,
  fetchGitHubCommitCiStatus,
  fetchGitHubContributions,
} from '../api/github.api'
import { useSettingsStore } from '../stores/settings.store'
import { useNotificationStore } from '../stores/notification.store'
import { useGitHubData } from './useGitHubData'
import type { MockPR } from '../app/pull-requests/types'

const mocked = {
  fetchGitHubPRs: fetchGitHubPRs as unknown as ReturnType<typeof vi.fn>,
  fetchGitHubReviewRequestedPRs: fetchGitHubReviewRequestedPRs as unknown as ReturnType<
    typeof vi.fn
  >,
  fetchGitHubPRDetails: fetchGitHubPRDetails as unknown as ReturnType<typeof vi.fn>,
  fetchGitHubCommitCiStatus: fetchGitHubCommitCiStatus as unknown as ReturnType<typeof vi.fn>,
  fetchGitHubContributions: fetchGitHubContributions as unknown as ReturnType<typeof vi.fn>,
}

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 1,
    title: 'Add feature',
    repo: 'repo',
    repoUrl: 'https://github.com/org/repo',
    fullName: 'org/repo',
    url: '',
    status: 'open',
    ciStatus: null,
    author: 'octocat',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    needsMyReview: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

function withToken() {
  useSettingsStore.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      github: {
        accounts: [
          {
            id: 'acc1',
            token: 'tok',
            user: { login: 'me', name: null, email: null, avatarUrl: '' },
          },
        ],
        activeAccountId: 'acc1',
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useNotificationStore.setState({ mockPRs: [] })
  mocked.fetchGitHubPRs.mockResolvedValue([])
  mocked.fetchGitHubReviewRequestedPRs.mockResolvedValue([])
  mocked.fetchGitHubPRDetails.mockResolvedValue({})
  mocked.fetchGitHubCommitCiStatus.mockResolvedValue({ checkRunsRes: null, statusRes: null })
  mocked.fetchGitHubContributions.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useGitHubData — no GitHub token (mock data mode)', () => {
  it('returns mock data and never calls the GitHub API', () => {
    const mockPr = pr({ id: 'mock-1' })
    useNotificationStore.setState({ mockPRs: [mockPr] })
    const { result } = renderHook(() => useGitHubData(), { wrapper })

    expect(result.current.hasToken).toBe(false)
    expect(result.current.prs).toEqual([mockPr])
    expect(result.current.loading).toBe(false)
    expect(result.current.username).toBeNull()
    expect(mocked.fetchGitHubPRs).not.toHaveBeenCalled()
  })
})

describe('useGitHubData — with a token', () => {
  it('fetches and merges PR search + review-requested search results', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1', needsMyReview: false })])
    mocked.fetchGitHubReviewRequestedPRs.mockResolvedValue([
      pr({ id: 'pr-2', needsMyReview: false }),
    ])

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prs.map((p) => p.id).sort()).toEqual(['pr-1', 'pr-2'])
    expect(result.current.prs.find((p) => p.id === 'pr-2')?.needsMyReview).toBe(true)
    expect(mocked.fetchGitHubPRs).toHaveBeenCalledWith('me', 'tok')
  })

  it('deduplicates a PR appearing in both searches, keeping needsMyReview forced true', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' })])
    mocked.fetchGitHubReviewRequestedPRs.mockResolvedValue([pr({ id: 'pr-1' })])

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prs).toHaveLength(1)
    expect(result.current.prs[0].needsMyReview).toBe(true)
  })

  it('enriches PRs with details from fetchGitHubPRDetails', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' })])
    mocked.fetchGitHubPRDetails.mockResolvedValue({
      additions: 12,
      deletions: 3,
      changed_files: 4,
      mergeable: false,
    })

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    const enriched = result.current.prs[0]
    expect(enriched.additions).toBe(12)
    expect(enriched.deletions).toBe(3)
    expect(enriched.filesChanged).toBe(4)
    expect(enriched.needsRebase).toBe(true)
  })

  it('does not fail the whole batch when enrichment fails for one PR', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' }), pr({ id: 'pr-2' })])
    mocked.fetchGitHubPRDetails.mockImplementation(async (url: string) =>
      url.includes('/pulls/1') ? Promise.reject(new Error('boom')) : { additions: 5 }
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prs).toHaveLength(2)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('resolves ciStatus "failure" when a check run concluded in failure', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' })])
    mocked.fetchGitHubPRDetails.mockResolvedValue({ head: { sha: 'sha1' } })
    mocked.fetchGitHubCommitCiStatus.mockResolvedValue({
      checkRunsRes: {
        total_count: 1,
        check_runs: [{ status: 'completed', conclusion: 'failure' }],
      },
      statusRes: null,
    })

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.prs[0].ciStatus).toBe('failure')
  })

  it('resolves ciStatus "running" when a check run is in progress', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' })])
    mocked.fetchGitHubPRDetails.mockResolvedValue({ head: { sha: 'sha1' } })
    mocked.fetchGitHubCommitCiStatus.mockResolvedValue({
      checkRunsRes: { total_count: 1, check_runs: [{ status: 'in_progress', conclusion: null }] },
      statusRes: null,
    })

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.prs[0].ciStatus).toBe('running')
  })

  it('resolves ciStatus "success" when a check run succeeded', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' })])
    mocked.fetchGitHubPRDetails.mockResolvedValue({ head: { sha: 'sha1' } })
    mocked.fetchGitHubCommitCiStatus.mockResolvedValue({
      checkRunsRes: {
        total_count: 1,
        check_runs: [{ status: 'completed', conclusion: 'success' }],
      },
      statusRes: null,
    })

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.prs[0].ciStatus).toBe('success')
  })

  it('resolves ciStatus "skipped" when every check run was skipped/neutral', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' })])
    mocked.fetchGitHubPRDetails.mockResolvedValue({ head: { sha: 'sha1' } })
    mocked.fetchGitHubCommitCiStatus.mockResolvedValue({
      checkRunsRes: {
        total_count: 1,
        check_runs: [{ status: 'completed', conclusion: 'skipped' }],
      },
      statusRes: null,
    })

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.prs[0].ciStatus).toBe('skipped')
  })

  it('leaves ciStatus null when there are no check runs or statuses', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' })])
    mocked.fetchGitHubPRDetails.mockResolvedValue({ head: { sha: 'sha1' } })

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.prs[0].ciStatus).toBeNull()
  })

  it('falls back to a zero-filled 365-day calendar when contributions fetch fails', async () => {
    withToken()
    mocked.fetchGitHubContributions.mockRejectedValue(new Error('rate limited'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.yearDays).toHaveLength(365)
    expect(result.current.yearDays.every((d) => d.commits === 0)).toBe(true)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('derives commitDays as the last 14 days of yearDays', async () => {
    withToken()
    mocked.fetchGitHubContributions.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({ date: `d${i}`, commits: i }))
    )
    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.commitDays).toHaveLength(14)
    expect(result.current.commitDays[0].date).toBe('d16')
  })

  it('refresh() triggers revalidation', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([])
    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    mocked.fetchGitHubPRs.mockClear()
    await act(async () => result.current.refresh())
    await waitFor(() => expect(mocked.fetchGitHubPRs).toHaveBeenCalled())
  })

  it('surfaces a fetch error as a string', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockRejectedValue(new Error('unauthorized'))
    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error).toContain('unauthorized')
  })
})
