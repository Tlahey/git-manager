import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/github.api', async () => ({
  // `parsePRStatus` is pure and is what enrichment re-derives a PR's lifecycle state with — keep
  // the real one, or every enrichment would throw and silently skip the CI resolution below it.
  ...(await vi.importActual<typeof import('../api/github.api')>('../api/github.api')),
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
import { DEV_FLAG_DEFAULTS, useDevFlagsStore } from '../stores/devFlags.store'
import { useDevFixturesStore, resetDevFixturesLoad } from '../stores/devFixtures.store'
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
  resetDevFixturesLoad()
  useDevFixturesStore.setState({ loaded: false, issues: [], contributions: [] })
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
  useNotificationStore.setState({ mockPRs: [] })
  useDevFlagsStore.setState(DEV_FLAG_DEFAULTS)
  mocked.fetchGitHubPRs.mockResolvedValue([])
  mocked.fetchGitHubReviewRequestedPRs.mockResolvedValue([])
  mocked.fetchGitHubPRDetails.mockResolvedValue({})
  mocked.fetchGitHubCommitCiStatus.mockResolvedValue({ checkRunsRes: null, statusRes: null })
  mocked.fetchGitHubContributions.mockResolvedValue([])
})


describe('useGitHubData — no GitHub token', () => {
  it('returns the fixtures while the mock flag is on, and never calls the GitHub API', () => {
    const mockPr = pr({ id: 'mock-1' })
    useNotificationStore.setState({ mockPRs: [mockPr] })
    const { result } = renderHook(() => useGitHubData(), { wrapper })

    expect(result.current.hasToken).toBe(false)
    expect(result.current.prs).toEqual([mockPr])
    expect(result.current.loading).toBe(false)
    expect(result.current.username).toBeNull()
    expect(mocked.fetchGitHubPRs).not.toHaveBeenCalled()
  })

  it('returns nothing at all with the flag off — which is what a real user gets', () => {
    // The fixtures used to be handed over to anyone without a token, so a user who had simply not
    // connected GitHub yet saw ten invented pull requests, with invented authors and titles,
    // rendered exactly like real ones. Fiction shown as fact is a worse first impression than the
    // empty list the Launchpad already knows how to draw.
    useDevFlagsStore.setState({ mockGitHub: false })
    useNotificationStore.setState({ mockPRs: [pr({ id: 'mock-1' })] })
    const { result } = renderHook(() => useGitHubData(), { wrapper })

    expect(result.current.prs).toEqual([])
    expect(result.current.hasToken).toBe(false)
    expect(mocked.fetchGitHubPRs).not.toHaveBeenCalled()
  })

  it('withholds the invented contribution graph too, not just the PRs', () => {
    useDevFlagsStore.setState({ mockGitHub: false })
    const { result } = renderHook(() => useGitHubData(), { wrapper })

    expect(result.current.yearDays).toEqual([])
    expect(result.current.commitDays).toEqual([])
    // No fabricated "last refreshed" either — nothing was.
    expect(result.current.lastRefreshed).toBeNull()
  })

  it('draws the invented graph once the flag has fetched it', async () => {
    // The history used to be generated at module scope, so a production start-up built a year of
    // random days and never used one. It now arrives with the rest of the fixtures.
    useDevFlagsStore.setState({ mockGitHub: true })
    const { result } = renderHook(() => useGitHubData(), { wrapper })

    await waitFor(() => expect(result.current.yearDays).toHaveLength(365))
    expect(result.current.commitDays).toHaveLength(14)
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

  it('re-derives a merged status from the details payload, not the stale search item', async () => {
    withToken()
    // What `search/issues` returns for a PR merged since the last poll: closed, and no top-level
    // `merged_at` — the shape that used to make a merge read as "closed without merging".
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1', status: 'closed' })])
    mocked.fetchGitHubPRDetails.mockResolvedValue({
      state: 'closed',
      draft: false,
      merged_at: '2026-07-29T10:00:00Z',
    })

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prs[0].status).toBe('merged')
  })

  it('keeps a genuinely closed PR closed', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' })])
    mocked.fetchGitHubPRDetails.mockResolvedValue({
      state: 'closed',
      draft: false,
      merged_at: null,
    })

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prs[0].status).toBe('closed')
  })

  it('flags a PR with auto-merge armed as queued', async () => {
    withToken()
    mocked.fetchGitHubPRs.mockResolvedValue([pr({ id: 'pr-1' })])
    mocked.fetchGitHubPRDetails.mockResolvedValue({
      state: 'open',
      draft: false,
      merged_at: null,
      auto_merge: { merge_method: 'squash' },
    })

    const { result } = renderHook(() => useGitHubData(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.prs[0].autoMerge).toBe(true)
    expect(result.current.prs[0].status).toBe('open')
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
