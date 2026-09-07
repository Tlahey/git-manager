import { beforeEach, describe, expect, it } from 'vitest'
import type { GithubApiResponse } from '../lib/tauri'
import { bucketKey, githubCooldownMs, useGithubRateLimitStore } from './githubRateLimit.store'

const CORE = 'https://api.github.com/repos/acme/app/pulls'
const SEARCH = 'https://api.github.com/search/issues?q=is:pr'

function response(over: Partial<GithubApiResponse> = {}): GithubApiResponse {
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
  }
}

function quota(over: Partial<NonNullable<GithubApiResponse['rateLimit']>> = {}) {
  return {
    limit: 5000,
    remaining: 4000,
    reset: Math.floor(Date.now() / 1000) + 3600,
    resource: 'core',
    ...over,
  }
}

function record(url: string, res: GithubApiResponse, accountId = 'octocat') {
  useGithubRateLimitStore.getState().recordResponse(accountId, url, res)
}

describe('githubRateLimit.store', () => {
  beforeEach(() => {
    useGithubRateLimitStore.setState({ buckets: {} })
  })

  it('records what GitHub said about the allowance', () => {
    record(CORE, response({ rateLimit: quota({ remaining: 4200 }) }))
    expect(useGithubRateLimitStore.getState().buckets[bucketKey('octocat', 'core')]).toMatchObject({
      limit: 5000,
      remaining: 4200,
      blockedUntil: null,
    })
  })

  it('keeps search and core apart, so a spent search does not stop a diff', () => {
    record(
      SEARCH,
      response({
        ok: false,
        status: 403,
        rateLimit: quota({ limit: 30, remaining: 0, resource: 'search' }),
      })
    )
    expect(githubCooldownMs('octocat', 'search')).toBeGreaterThan(0)
    expect(githubCooldownMs('octocat', 'core')).toBe(0)
  })

  it('keeps one account out of another account allowance', () => {
    record(
      CORE,
      response({ ok: false, status: 403, rateLimit: quota({ remaining: 0 }) }),
      'octocat'
    )
    expect(githubCooldownMs('octocat', 'core')).toBeGreaterThan(0)
    expect(githubCooldownMs('hubot', 'core')).toBe(0)
  })

  it('honours a Retry-After even with no quota headers at all', () => {
    // A secondary rate limit is a separate mechanism from the hourly allowance, and ignoring it is
    // what escalates a short block into a longer one.
    record(CORE, response({ ok: false, status: 429, retryAfterSecs: 30 }))
    expect(githubCooldownMs('octocat', 'core')).toBeGreaterThan(25_000)
  })

  it('never shortens a cooldown already in force', () => {
    record(CORE, response({ ok: false, status: 429, retryAfterSecs: 120 }))
    const long = githubCooldownMs('octocat', 'core')
    record(CORE, response({ ok: false, status: 429, retryAfterSecs: 5 }))
    expect(githubCooldownMs('octocat', 'core')).toBeGreaterThanOrEqual(long - 1_000)
  })

  it('clears the cooldown as soon as a request actually succeeds', () => {
    // The self-correction that keeps a wait computed from a skewed clock from stranding the app.
    record(CORE, response({ ok: false, status: 403, rateLimit: quota({ remaining: 0 }) }))
    expect(githubCooldownMs('octocat', 'core')).toBeGreaterThan(0)
    record(CORE, response({ rateLimit: quota({ remaining: 4999 }) }))
    expect(githubCooldownMs('octocat', 'core')).toBe(0)
  })

  it('ignores a response that says nothing about the quota', () => {
    record(CORE, response())
    expect(useGithubRateLimitStore.getState().buckets).toEqual({})
  })

  it('keeps the same bucket object when nothing changed, so pollers do not re-render', () => {
    const headers = quota({ remaining: 4200 })
    record(CORE, response({ rateLimit: headers }))
    const before = useGithubRateLimitStore.getState().buckets
    record(CORE, response({ rateLimit: { ...headers } }))
    expect(useGithubRateLimitStore.getState().buckets).toBe(before)
  })

  it('files an unmodelled resource under the bucket the URL implies', () => {
    record(
      SEARCH,
      response({ rateLimit: quota({ limit: 30, remaining: 4, resource: 'code_search' }) })
    )
    expect(
      useGithubRateLimitStore.getState().buckets[bucketKey('octocat', 'search')]
    ).toMatchObject({ remaining: 4 })
  })

  it('forgets an account and nobody else', () => {
    record(CORE, response({ rateLimit: quota() }), 'leaver')
    record(CORE, response({ rateLimit: quota() }), 'stayer')
    useGithubRateLimitStore.getState().forgetAccount('leaver')
    const { buckets } = useGithubRateLimitStore.getState()
    expect(buckets[bucketKey('leaver', 'core')]).toBeUndefined()
    expect(buckets[bucketKey('stayer', 'core')]).toBeDefined()
  })
})
