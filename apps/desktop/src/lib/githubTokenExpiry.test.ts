import { describe, expect, it } from 'vitest'
import {
  buildClassicTokenUrl,
  CLASSIC_TOKEN_SCOPES,
  describeTokenExpiry,
  EXPIRY_WARNING_DAYS,
} from './githubTokenExpiry'

const NOW = Date.parse('2026-09-07T12:00:00Z')
const inDays = (days: number) => new Date(NOW + days * 86_400_000).toISOString()

describe('describeTokenExpiry', () => {
  it('has nothing to say about a token with no expiry date', () => {
    // The two cases that reach this: a token set never to expire, and an account connected before
    // the app recorded the date. Neither should warn.
    expect(describeTokenExpiry(null, NOW)).toBeNull()
    expect(describeTokenExpiry(undefined, NOW)).toBeNull()
  })

  it('ignores a date it cannot parse rather than reporting a bogus deadline', () => {
    expect(describeTokenExpiry('not a date', NOW)).toBeNull()
  })

  it('leaves a token with months left alone', () => {
    const status = describeTokenExpiry(inDays(90), NOW)
    expect(status?.level).toBe('ok')
    expect(status?.daysLeft).toBe(90)
  })

  it('warns exactly on the boundary day', () => {
    expect(describeTokenExpiry(inDays(EXPIRY_WARNING_DAYS), NOW)?.level).toBe('expiring')
    expect(describeTokenExpiry(inDays(EXPIRY_WARNING_DAYS + 1), NOW)?.level).toBe('ok')
  })

  it('rounds a part-day up, so a token dying tonight does not read as zero days', () => {
    const status = describeTokenExpiry(new Date(NOW + 11 * 3_600_000).toISOString(), NOW)
    expect(status?.daysLeft).toBe(1)
    expect(status?.level).toBe('expiring')
  })

  it('calls a passed date expired', () => {
    const status = describeTokenExpiry(inDays(-2), NOW)
    expect(status?.level).toBe('expired')
    expect(status?.daysLeft).toBeLessThan(0)
  })
})

describe('buildClassicTokenUrl', () => {
  it('points at the classic-token page with the scopes the app needs', () => {
    const url = new URL(buildClassicTokenUrl())
    expect(url.origin + url.pathname).toBe('https://github.com/settings/tokens/new')
    expect(url.searchParams.get('scopes')).toBe(CLASSIC_TOKEN_SCOPES.join(','))
    expect(url.searchParams.get('description')).toBe('Git Manager')
  })

  it('asks for read:org — the scope whose absence makes an organization look empty', () => {
    expect(CLASSIC_TOKEN_SCOPES).toContain('read:org')
  })

  it('does not ask for workflow, which the app never uses', () => {
    expect(CLASSIC_TOKEN_SCOPES).not.toContain('workflow')
  })
})
