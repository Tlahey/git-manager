import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { timeAgo, openUrl, ciActionUrl, isSnoozed, snoozeUntil, timeUntil } from './utils'
import type { CiDetail } from './types'

describe('timeAgo', () => {
  const NOW = new Date('2024-06-15T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats seconds for very recent dates', () => {
    expect(timeAgo(new Date(NOW.getTime() - 30_000))).toBe('30s ago')
  })

  it('formats minutes once past 60 seconds', () => {
    expect(timeAgo(new Date(NOW.getTime() - 5 * 60_000))).toBe('5m ago')
  })

  it('formats hours once past 60 minutes', () => {
    expect(timeAgo(new Date(NOW.getTime() - 3 * 3_600_000))).toBe('3h ago')
  })

  it('formats days once past 24 hours', () => {
    expect(timeAgo(new Date(NOW.getTime() - 5 * 86_400_000))).toBe('5d ago')
  })

  it('formats months once past 30 days', () => {
    expect(timeAgo(new Date(NOW.getTime() - 90 * 86_400_000))).toBe('3mo ago')
  })

  it('formats a date at exactly the boundary as the next larger unit', () => {
    expect(timeAgo(new Date(NOW.getTime() - 60_000))).toBe('1m ago')
    expect(timeAgo(new Date(NOW.getTime() - 3_600_000))).toBe('1h ago')
    expect(timeAgo(new Date(NOW.getTime() - 86_400_000))).toBe('1d ago')
  })
})

describe('openUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('opens the URL via the Tauri shell plugin when available', async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@tauri-apps/plugin-shell', () => ({ open }))
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { openUrl: openUrlFresh } = await import('./utils')
    await openUrlFresh('https://example.com')

    expect(open).toHaveBeenCalledWith('https://example.com')
    expect(windowOpen).not.toHaveBeenCalled()
  })

  it('falls back to window.open when the Tauri shell plugin is unavailable', async () => {
    vi.doMock('@tauri-apps/plugin-shell', () => {
      throw new Error('not available outside Tauri')
    })
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { openUrl: openUrlFresh } = await import('./utils')
    await openUrlFresh('https://example.com')

    expect(windowOpen).toHaveBeenCalledWith('https://example.com', '_blank')
  })

  it('falls back to window.open when open() itself rejects', async () => {
    vi.doMock('@tauri-apps/plugin-shell', () => ({
      open: vi.fn().mockRejectedValue(new Error('denied')),
    }))
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)

    const { openUrl: openUrlFresh } = await import('./utils')
    await openUrlFresh('https://example.com')

    expect(windowOpen).toHaveBeenCalledWith('https://example.com', '_blank')
  })

  it('is exported and callable directly from the module under test', () => {
    expect(typeof openUrl).toBe('function')
  })
})

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
