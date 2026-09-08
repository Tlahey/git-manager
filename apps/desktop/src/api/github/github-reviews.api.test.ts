import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/tauri', () => ({ githubApiRequest: vi.fn() }))

import { githubApiRequest } from '../../lib/tauri'
import { fetchPrReviewComments } from './github-reviews.api'
import { useGithubRateLimitStore } from '../../stores/githubRateLimit.store'

const requested = vi.mocked(githubApiRequest)

function envelope(body: unknown) {
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

beforeEach(() => {
  vi.clearAllMocks()
  useGithubRateLimitStore.setState({ buckets: {} })
})

describe('fetchPrReviewComments', () => {
  it('reads the pull request reviews endpoint', async () => {
    requested.mockResolvedValue(envelope([]))

    await fetchPrReviewComments('acme', 'app', 42, 'acct')

    expect(requested.mock.calls[0][0].url).toBe(
      'https://api.github.com/repos/acme/app/pulls/42/reviews?per_page=100'
    )
  })

  it('returns a bot reviewer report the issue-comments endpoint never carries', async () => {
    requested.mockResolvedValue(
      envelope([
        {
          id: 1,
          body: '## Pull Request Overview\n\nCopilot reviewed 12 files.',
          html_url: 'https://github.com/acme/app/pull/42#pullrequestreview-1',
          submitted_at: '2026-09-01T10:00:00Z',
          state: 'COMMENTED',
          user: { login: 'Copilot', avatar_url: 'https://x/c.png' },
        },
      ])
    )

    const reviews = await fetchPrReviewComments('acme', 'app', 42, 'acct')

    expect(reviews).toEqual([
      {
        id: 1,
        body: '## Pull Request Overview\n\nCopilot reviewed 12 files.',
        html_url: 'https://github.com/acme/app/pull/42#pullrequestreview-1',
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-01T10:00:00Z',
        user: { login: 'Copilot', avatar_url: 'https://x/c.png' },
        state: 'COMMENTED',
      },
    ])
  })

  it('drops bodiless reviews, which would render as empty cards', async () => {
    requested.mockResolvedValue(
      envelope([
        { id: 1, body: '', state: 'APPROVED', submitted_at: '2026-09-01T10:00:00Z' },
        { id: 2, body: '   ', state: 'COMMENTED', submitted_at: '2026-09-01T11:00:00Z' },
        { id: 3, body: 'LGTM', state: 'APPROVED', submitted_at: '2026-09-01T12:00:00Z' },
      ])
    )

    const reviews = await fetchPrReviewComments('acme', 'app', 42, 'acct')

    expect(reviews.map((r) => r.id)).toEqual([3])
    expect(reviews[0].state).toBe('APPROVED')
  })

  it("drops the viewer's own unsubmitted draft", async () => {
    requested.mockResolvedValue(
      envelope([{ id: 4, body: 'draft thoughts', state: 'PENDING', submitted_at: null }])
    )

    await expect(fetchPrReviewComments('acme', 'app', 42, 'acct')).resolves.toEqual([])
  })

  it('falls back to COMMENTED for a state it does not know', async () => {
    requested.mockResolvedValue(
      envelope([
        { id: 5, body: 'hmm', state: 'SOMETHING_NEW', submitted_at: '2026-09-01T10:00:00Z' },
      ])
    )

    const reviews = await fetchPrReviewComments('acme', 'app', 42, 'acct')

    expect(reviews[0].state).toBe('COMMENTED')
    expect(reviews[0].user).toBeUndefined()
  })
})
