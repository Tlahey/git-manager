import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/tauri', () => ({ githubApiRequest: vi.fn() }))

import { githubApiRequest } from '../../lib/tauri'
import { clearDashboardCache, fetchDashboardPullRequests } from './github-dashboard.api'
import { useGithubRateLimitStore } from '../../stores/githubRateLimit.store'

const requested = vi.mocked(githubApiRequest)

function reply(body: unknown) {
  return {
    status: 200,
    ok: true,
    body: JSON.stringify(body),
    sso: null,
    tokenExpiresAt: null,
    rateLimit: null,
    retryAfterSecs: null,
    fromCache: false,
  } as Awaited<ReturnType<typeof githubApiRequest>>
}

/** One `search/issues` item, in the issue-shaped form the search endpoint actually returns. */
function searchItem(number: number, updatedAt = '2026-09-01T10:00:00Z') {
  return {
    number,
    title: `PR ${number}`,
    html_url: `https://github.com/acme/app/pull/${number}`,
    repository_url: 'https://api.github.com/repos/acme/app',
    state: 'open',
    draft: false,
    merged_at: null,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: updatedAt,
    user: { login: 'octocat', avatar_url: 'https://x/o.png' },
  }
}

/** The details payload the enrichment asks for once a pull request has moved. */
function detailsPayload(number: number) {
  return {
    ...searchItem(number),
    additions: 10,
    deletions: 2,
    changed_files: 3,
    mergeable: true,
    head: { ref: 'feature', sha: `sha${number}` },
  }
}

/** Answers each URL by shape, so a test can assert on *which* calls were made rather than order. */
function routeGithub(handler: (url: string) => unknown) {
  requested.mockImplementation(async (input) => reply(handler(input.url)))
}

/** URLs of every request that actually went out, in order. */
function calledUrls(): string[] {
  return requested.mock.calls.map((c) => c[0].url)
}

beforeEach(() => {
  vi.clearAllMocks()
  clearDashboardCache()
  useGithubRateLimitStore.setState({ buckets: {} })
})

describe('fetchDashboardPullRequests', () => {
  it('merges the two searches and marks the review-requested ones', async () => {
    routeGithub((url) => {
      if (url.includes('review-requested')) return { items: [searchItem(2)] }
      if (url.includes('search/issues')) return { items: [searchItem(1)] }
      if (url.includes('/pulls/')) return detailsPayload(Number(url.split('/pulls/')[1]))
      return { check_runs: [], total_count: 0 }
    })

    const prs = await fetchDashboardPullRequests('octocat', 'octocat')
    expect(prs.map((p) => p.number).sort((a, b) => a - b)).toEqual([1, 2])
    expect(prs.find((p) => p.number === 2)?.needsMyReview).toBe(true)
  })

  it('skips the details call for a pull request that has not moved since the last poll', async () => {
    // `updated_at` comes free on the search result and GitHub moves it for every event that changes
    // anything the details payload carries — so an untouched PR costs no request at all.
    routeGithub((url) => {
      if (url.includes('review-requested')) return { items: [] }
      if (url.includes('search/issues')) return { items: [searchItem(1)] }
      if (url.includes('/pulls/')) return detailsPayload(1)
      return { check_runs: [], total_count: 0 }
    })

    await fetchDashboardPullRequests('octocat', 'octocat')
    expect(calledUrls().filter((u) => u.includes('/pulls/1'))).toHaveLength(1)

    requested.mockClear()
    await fetchDashboardPullRequests('octocat', 'octocat')
    expect(calledUrls().filter((u) => u.includes('/pulls/1'))).toHaveLength(0)
  })

  it('fetches the details again once the pull request moves', async () => {
    let updatedAt = '2026-09-01T10:00:00Z'
    routeGithub((url) => {
      if (url.includes('review-requested')) return { items: [] }
      if (url.includes('search/issues')) return { items: [searchItem(1, updatedAt)] }
      if (url.includes('/pulls/')) return detailsPayload(1)
      return { check_runs: [], total_count: 0 }
    })

    await fetchDashboardPullRequests('octocat', 'octocat')
    updatedAt = '2026-09-01T11:00:00Z'
    requested.mockClear()

    await fetchDashboardPullRequests('octocat', 'octocat')
    expect(calledUrls().filter((u) => u.includes('/pulls/1'))).toHaveLength(1)
  })

  it('re-asks for CI every time, because a finished check does not move updated_at', async () => {
    // The asymmetry that matters: keying the CI badge on `updated_at` would freeze a running build
    // on screen forever. Those stay conditional requests instead.
    routeGithub((url) => {
      if (url.includes('review-requested')) return { items: [] }
      if (url.includes('search/issues')) return { items: [searchItem(1)] }
      if (url.includes('/pulls/')) return detailsPayload(1)
      return { check_runs: [], total_count: 0 }
    })

    await fetchDashboardPullRequests('octocat', 'octocat')
    requested.mockClear()
    await fetchDashboardPullRequests('octocat', 'octocat')
    expect(calledUrls().filter((u) => u.includes('check-runs'))).toHaveLength(1)
    expect(calledUrls().filter((u) => u.endsWith('/status'))).toHaveLength(1)
  })

  it('never opens more than a handful of connections at once', async () => {
    // Twenty-five open pull requests used to mean seventy-five simultaneous requests, once a minute,
    // from one token — a burst independent of the hourly quota.
    let inFlight = 0
    let peak = 0
    requested.mockImplementation(async (input) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 0))
      inFlight--
      const url = input.url
      if (url.includes('review-requested')) return reply({ items: [] })
      if (url.includes('search/issues'))
        return reply({ items: Array.from({ length: 25 }, (_, i) => searchItem(i + 1)) })
      if (url.includes('/pulls/')) return reply(detailsPayload(Number(url.split('/pulls/')[1])))
      return reply({ check_runs: [], total_count: 0 })
    })

    await fetchDashboardPullRequests('octocat', 'octocat')
    // Six enrichment workers, each of which may have its two CI calls out together.
    expect(peak).toBeLessThanOrEqual(12)
  })

  it('still shows a pull request whose enrichment failed', async () => {
    // Failing the whole dashboard because one repository answered 403 is a worse answer than a
    // slightly thinner row.
    requested.mockImplementation(async (input) => {
      if (input.url.includes('review-requested')) return reply({ items: [] })
      if (input.url.includes('search/issues')) return reply({ items: [searchItem(1)] })
      throw new Error('403')
    })

    const prs = await fetchDashboardPullRequests('octocat', 'octocat')
    expect(prs).toHaveLength(1)
    expect(prs[0].number).toBe(1)
  })

  it('re-derives the lifecycle state from the details payload, not the search item', async () => {
    // Search items are issue-shaped and lag by up to a minute: a PR merged since the last poll would
    // otherwise stay labelled as merely closed.
    routeGithub((url) => {
      if (url.includes('review-requested')) return { items: [] }
      if (url.includes('search/issues')) return { items: [searchItem(1)] }
      if (url.includes('/pulls/'))
        return { ...detailsPayload(1), state: 'closed', merged_at: '2026-09-02T09:00:00Z' }
      return { check_runs: [], total_count: 0 }
    })

    const prs = await fetchDashboardPullRequests('octocat', 'octocat')
    expect(prs[0].status).toBe('merged')
  })
})
