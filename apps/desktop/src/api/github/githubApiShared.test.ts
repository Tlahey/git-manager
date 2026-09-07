import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/tauri', () => ({
  githubApiRequest: vi.fn(),
}))

import { githubApiRequest } from '../../lib/tauri'
import { ghFetch, ghGraphQL, ghRequest, GithubRateLimitedError } from './githubApiShared'
import { useGithubRateLimitStore } from '../../stores/githubRateLimit.store'

const requested = vi.mocked(githubApiRequest)

const CORE = 'https://api.github.com/repos/acme/app/pulls'
const SEARCH = 'https://api.github.com/search/issues?q=is:pr'

function reply(over: Record<string, unknown> = {}) {
  return {
    status: 200,
    ok: true,
    body: '{}',
    sso: null,
    tokenExpiresAt: null,
    rateLimit: null,
    retryAfterSecs: null,
    fromCache: false,
    ...over,
  } as Awaited<ReturnType<typeof githubApiRequest>>
}

function quota(over: Record<string, unknown> = {}) {
  return {
    limit: 5000,
    remaining: 4000,
    reset: Math.floor(Date.now() / 1000) + 3600,
    resource: 'core',
    ...over,
  }
}

describe('the GitHub transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGithubRateLimitStore.setState({ buckets: {} })
    requested.mockResolvedValue(reply())
  })

  it('records the quota GitHub reported', () => {
    requested.mockResolvedValue(reply({ rateLimit: quota({ remaining: 3999 }) }))
    return ghFetch(CORE, 'octocat').then(() => {
      expect(useGithubRateLimitStore.getState().buckets['octocat:core']).toMatchObject({
        remaining: 3999,
      })
    })
  })

  it('refuses a request without sending it while the bucket is blocked', async () => {
    // The point is that nothing leaves: a request inside a secondary limit is what turns a short
    // block into a longer one, and one against a spent allowance is a guaranteed 403 that several
    // callers render as an empty list.
    requested.mockResolvedValue(reply({ ok: false, status: 429, retryAfterSecs: 60 }))
    await expect(ghFetch(CORE, 'octocat')).rejects.toThrow()
    requested.mockClear()

    await expect(ghFetch(CORE, 'octocat')).rejects.toThrow(GithubRateLimitedError)
    expect(requested).not.toHaveBeenCalled()
  })

  it('states how long the wait is, rather than failing bare', async () => {
    requested.mockResolvedValue(reply({ ok: false, status: 429, retryAfterSecs: 60 }))
    await expect(ghFetch(CORE, 'octocat')).rejects.toThrow()

    const refused = await ghFetch(CORE, 'octocat').catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(GithubRateLimitedError)
    expect((refused as GithubRateLimitedError).waitMs).toBeGreaterThan(0)
  })

  it('blocks only the bucket that was refused', async () => {
    // A spent search allowance must not stop the app fetching a diff — they are separate budgets at
    // GitHub, and conflating them would be a self-inflicted outage.
    requested.mockResolvedValue(
      reply({
        ok: false,
        status: 403,
        rateLimit: quota({ limit: 30, remaining: 0, resource: 'search' }),
      })
    )
    await expect(ghFetch(SEARCH, 'octocat')).rejects.toThrow()

    requested.mockClear()
    requested.mockResolvedValue(reply())
    await ghFetch(CORE, 'octocat')
    expect(requested).toHaveBeenCalledTimes(1)

    requested.mockClear()
    await expect(ghFetch(SEARCH, 'octocat')).rejects.toThrow(GithubRateLimitedError)
    expect(requested).not.toHaveBeenCalled()
  })

  it('gates GraphQL on its own allowance', async () => {
    requested.mockResolvedValue(
      reply({
        ok: false,
        status: 403,
        rateLimit: quota({ limit: 5000, remaining: 0, resource: 'graphql' }),
      })
    )
    await expect(ghGraphQL('query{}', {}, 'octocat')).rejects.toThrow()

    requested.mockClear()
    await expect(ghGraphQL('query{}', {}, 'octocat')).rejects.toThrow(GithubRateLimitedError)
    expect(requested).not.toHaveBeenCalled()
    expect(useGithubRateLimitStore.getState().buckets['octocat:graphql']).toBeDefined()
  })

  it('lets a write through while the quota is healthy', async () => {
    requested.mockResolvedValue(reply({ rateLimit: quota() }))
    await ghRequest(CORE, { method: 'POST', body: { title: 'x' }, accountId: 'octocat' })
    expect(requested).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', accountId: 'octocat' })
    )
  })

  it('tracks an anonymous request under its own allowance', async () => {
    // Signed out has a quota too (60/hour by IP), and it is not any account's.
    requested.mockResolvedValue(reply({ rateLimit: quota({ limit: 60, remaining: 10 }) }))
    await ghFetch(CORE)
    expect(useGithubRateLimitStore.getState().buckets[':core']).toMatchObject({ remaining: 10 })
  })
})
