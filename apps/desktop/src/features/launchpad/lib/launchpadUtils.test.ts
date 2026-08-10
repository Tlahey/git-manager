import { describe, it, expect } from 'vitest'
import { ciActionUrl, isSnoozed, snoozeUntil, timeUntil, isMyIssue } from './launchpadUtils'
import type { CiDetail, MockIssue } from '../../../lib/github/types'

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: '1',
    number: 42,
    title: 'Fix the thing',
    repo: 'repo',
    url: '',
    status: 'open',
    author: 'octocat',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    thumbsUp: 0,
    ...overrides,
  }
}

describe('ciActionUrl', () => {
  const PR = 'https://github.com/owner/repo/pull/7'

  it('returns undefined when there is no CI and no PR url', () => {
    expect(ciActionUrl(null, undefined)).toBeUndefined()
    expect(ciActionUrl(null, [])).toBeUndefined()
  })

  it('falls back to the PR Checks tab when a status exists but no check carries a link', () => {
    expect(ciActionUrl('success', [{ name: 'build', status: 'success' }], PR)).toBe(`${PR}/checks`)
  })

  it('never falls back for a null (no-CI) status even with a PR url', () => {
    expect(ciActionUrl(null, [], PR)).toBeUndefined()
  })

  it('prefers the failing check link over any other', () => {
    const details: CiDetail[] = [
      { name: 'build', status: 'success', url: 'https://ci/success' },
      { name: 'lint', status: 'failure', url: 'https://ci/fail' },
      { name: 'e2e', status: 'running', url: 'https://ci/run' },
    ]
    expect(ciActionUrl('failure', details, PR)).toBe('https://ci/fail')
  })

  it('prefers a running check when nothing is failing', () => {
    const details: CiDetail[] = [
      { name: 'build', status: 'success', url: 'https://ci/success' },
      { name: 'e2e', status: 'running', url: 'https://ci/run' },
    ]
    expect(ciActionUrl('running', details, PR)).toBe('https://ci/run')
  })

  it('uses the first linked check when none are failing or running', () => {
    const details: CiDetail[] = [
      { name: 'build', status: 'success', url: 'https://ci/success' },
      { name: 'test', status: 'success', url: 'https://ci/success-2' },
    ]
    expect(ciActionUrl('success', details, PR)).toBe('https://ci/success')
  })

  it('ignores checks without a url when picking by status', () => {
    const details: CiDetail[] = [
      { name: 'lint', status: 'failure' },
      { name: 'build', status: 'success', url: 'https://ci/success' },
    ]
    expect(ciActionUrl('failure', details, PR)).toBe('https://ci/success')
  })
})

describe('isSnoozed', () => {
  const NOW = 1_000_000

  it('is false for a PR with no snooze entry', () => {
    expect(isSnoozed('pr-1', {}, NOW)).toBe(false)
  })

  it('is true for an indefinite (null) snooze', () => {
    expect(isSnoozed('pr-1', { 'pr-1': null }, NOW)).toBe(true)
  })

  it('is true while the wake time is still in the future', () => {
    expect(isSnoozed('pr-1', { 'pr-1': NOW + 1000 }, NOW)).toBe(true)
  })

  it('is false once the wake time has passed (auto-expiry)', () => {
    expect(isSnoozed('pr-1', { 'pr-1': NOW - 1000 }, NOW)).toBe(false)
  })
})

describe('snoozeUntil', () => {
  const NOW = new Date('2024-06-15T12:00:00.000Z').getTime()

  it('adds an hour for the hour preset', () => {
    expect(snoozeUntil('hour', NOW)).toBe(NOW + 60 * 60 * 1000)
  })

  it('returns null for an indefinite snooze', () => {
    expect(snoozeUntil('indefinitely', NOW)).toBeNull()
  })

  it('resolves tomorrow to 09:00 local on the next day', () => {
    const d = new Date(snoozeUntil('tomorrow', NOW) as number)
    expect(d.getHours()).toBe(9)
    expect(d.getDate()).toBe(16)
  })

  it('resolves next week to 7 days ahead', () => {
    const d = new Date(snoozeUntil('nextWeek', NOW) as number)
    expect(d.getDate()).toBe(22)
  })
})

describe('timeUntil', () => {
  const NOW = 1_000_000_000

  it('returns null for an indefinite snooze', () => {
    expect(timeUntil(null, NOW)).toBeNull()
  })

  it('formats minutes, hours and days', () => {
    expect(timeUntil(NOW + 30 * 60_000, NOW)).toBe('30m')
    expect(timeUntil(NOW + 3 * 3_600_000, NOW)).toBe('3h')
    expect(timeUntil(NOW + 2 * 86_400_000, NOW)).toBe('2d')
  })

  it('clamps a past wake time to at least one minute', () => {
    expect(timeUntil(NOW - 5000, NOW)).toBe('1m')
  })
})

describe('isMyIssue', () => {
  it('is false without a signed-in user', () => {
    expect(isMyIssue(issue({ author: 'me' }), null)).toBe(false)
  })

  it('matches on author or assignee', () => {
    expect(isMyIssue(issue({ author: 'me' }), 'me')).toBe(true)
    expect(isMyIssue(issue({ author: 'x', assignees: [{ login: 'me', avatar: '' }] }), 'me')).toBe(
      true
    )
    expect(isMyIssue(issue({ author: 'x' }), 'me')).toBe(false)
  })
})
