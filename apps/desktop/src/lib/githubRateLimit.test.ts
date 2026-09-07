import { describe, expect, it } from 'vitest'
import {
  cooldownForResponse,
  cooldownMs,
  MAX_COOLDOWN_MS,
  normalizeRateResource,
  rateLimitResourceForUrl,
  remainingFraction,
  throttledInterval,
  type GithubRateBucket,
} from './githubRateLimit'

const NOW = 1_800_000_000_000

function bucket(over: Partial<GithubRateBucket> = {}): GithubRateBucket {
  return { limit: 5000, remaining: 5000, reset: NOW / 1000 + 3600, blockedUntil: null, ...over }
}

describe('rateLimitResourceForUrl', () => {
  it('bills a search to the tight bucket rather than to core', () => {
    // The distinction that matters: search is 30/minute, core 5000/hour. Filing a search under core
    // would let the saved PR filters exhaust an allowance nothing is watching.
    expect(rateLimitResourceForUrl('https://api.github.com/search/issues?q=is:pr')).toBe('search')
  })

  it('bills the v4 endpoint to graphql', () => {
    expect(rateLimitResourceForUrl('https://api.github.com/graphql')).toBe('graphql')
  })

  it('bills everything else to core', () => {
    expect(rateLimitResourceForUrl('https://api.github.com/repos/acme/app/pulls/7')).toBe('core')
  })
})

describe('normalizeRateResource', () => {
  it('keeps a bucket the app models', () => {
    expect(normalizeRateResource('search', 'https://api.github.com/repos/a/b')).toBe('search')
  })

  it('files an unmodelled resource under the one the URL implies', () => {
    // `code_search`, `integration_manifest`… — tracking a key nothing consults would let the real
    // bucket run to zero unnoticed.
    expect(normalizeRateResource('code_search', 'https://api.github.com/search/code?q=x')).toBe(
      'search'
    )
    expect(normalizeRateResource('integration_manifest', 'https://api.github.com/user')).toBe(
      'core'
    )
  })
})

describe('cooldownForResponse', () => {
  it('honours a Retry-After verbatim — the secondary limit GitHub names itself', () => {
    const until = cooldownForResponse({ retryAfterSecs: 45, rateLimit: null }, NOW)
    expect(until).toBe(NOW + 45_000)
  })

  it('waits out a spent allowance until its reset', () => {
    const until = cooldownForResponse(
      { retryAfterSecs: null, rateLimit: { remaining: 0, reset: NOW / 1000 + 600 } },
      NOW
    )
    expect(until).toBe(NOW + 600_000)
  })

  it('imposes nothing while there is quota left', () => {
    // Slowing down before the wall is the poller's job, not a reason to refuse a merge the user
    // just clicked.
    expect(
      cooldownForResponse(
        { retryAfterSecs: null, rateLimit: { remaining: 12, reset: NOW / 1000 + 600 } },
        NOW
      )
    ).toBeNull()
  })

  it('caps an implausible wait, so a skewed clock cannot strand the app', () => {
    const until = cooldownForResponse(
      { retryAfterSecs: null, rateLimit: { remaining: 0, reset: NOW / 1000 + 86_400 } },
      NOW
    )
    expect(until).toBe(NOW + MAX_COOLDOWN_MS)
  })

  it('reads a reset already in the past as no wait at all', () => {
    const until = cooldownForResponse(
      { retryAfterSecs: null, rateLimit: { remaining: 0, reset: NOW / 1000 - 60 } },
      NOW
    )
    expect(until).toBe(NOW)
  })
})

describe('cooldownMs', () => {
  it('is zero for a bucket nobody has heard from, and for a free one', () => {
    expect(cooldownMs(undefined, NOW)).toBe(0)
    expect(cooldownMs(bucket(), NOW)).toBe(0)
  })

  it('counts down to the deadline', () => {
    expect(cooldownMs(bucket({ blockedUntil: NOW + 30_000 }), NOW)).toBe(30_000)
    expect(cooldownMs(bucket({ blockedUntil: NOW - 1 }), NOW)).toBe(0)
  })
})

describe('remainingFraction', () => {
  it('distinguishes an unknown bucket from a full one', () => {
    expect(remainingFraction(undefined)).toBeNull()
    expect(remainingFraction(bucket({ limit: 0 }))).toBeNull()
    expect(remainingFraction(bucket({ remaining: 2500 }))).toBe(0.5)
  })
})

describe('throttledInterval', () => {
  it('leaves a comfortable session alone', () => {
    expect(throttledInterval(60_000, bucket(), NOW)).toBe(60_000)
    expect(throttledInterval(60_000, undefined, NOW)).toBe(60_000)
  })

  it('backs off in steps rather than at a cliff', () => {
    // A single threshold would let the app run at full speed until it stopped dead — which is the
    // failure this exists to avoid.
    expect(throttledInterval(60_000, bucket({ remaining: 2000 }), NOW)).toBe(120_000)
    expect(throttledInterval(60_000, bucket({ remaining: 600 }), NOW)).toBe(240_000)
    expect(throttledInterval(60_000, bucket({ remaining: 100 }), NOW)).toBe(480_000)
  })

  it('stops entirely while the bucket is blocked', () => {
    // Zero is SWR's "do not poll"; the request would be refused anyway.
    expect(throttledInterval(60_000, bucket({ blockedUntil: NOW + 10_000 }), NOW)).toBe(0)
  })
})
