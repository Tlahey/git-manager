import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatRelativeDate,
  formatExactDate,
  formatRelativeTime,
  formatShortDate,
  formatDateTimeLong,
  timeAgo,
} from './relativeDate'

const nowSec = () => Math.floor(Date.now() / 1000)

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

describe('formatRelativeDate', () => {
  it('reports very recent timestamps as "just now"', () => {
    expect(formatRelativeDate(nowSec())).toBe('just now')
  })

  it('reports minutes', () => {
    expect(formatRelativeDate(nowSec() - 5 * 60)).toBe('5m ago')
  })

  it('reports hours', () => {
    expect(formatRelativeDate(nowSec() - 3 * 3600)).toBe('3h ago')
  })

  it('reports days', () => {
    expect(formatRelativeDate(nowSec() - 2 * 86400)).toBe('2d ago')
  })

  it('reports years', () => {
    expect(formatRelativeDate(nowSec() - 2 * 365 * 86400)).toBe('2y ago')
  })
})

describe('formatExactDate', () => {
  it('produces a locale string for a known epoch', () => {
    // 2021-01-01T00:00:00Z
    expect(formatExactDate(1609459200)).toEqual(new Date(1609459200 * 1000).toLocaleString())
  })
})

describe('formatShortDate', () => {
  it('formats a date without the time component', () => {
    // 2021-01-01T00:00:00Z
    expect(formatShortDate(1609459200)).toEqual(new Date(1609459200 * 1000).toLocaleDateString())
  })
})

// The locale argument is the whole point of these helpers: an app running in English on a
// French machine used to print French month names next to English copy, because the call sites
// passed no locale and `Intl` then falls back to the *system* one.
describe('locale handling', () => {
  // 2026-08-03T12:20:18Z — the month name differs between the two locales, which is exactly the
  // difference the reported bug showed ("03 août 2026" in an English UI).
  const EPOCH = 1785759618

  it('formatDateTimeLong follows the language it is given', () => {
    expect(formatDateTimeLong(EPOCH, 'en-US')).toContain('Aug')
    expect(formatDateTimeLong(EPOCH, 'fr-FR')).toContain('août')
  })

  it('formatDateTimeLong keeps the seconds the commit header shows', () => {
    // Two colons = h:mm:ss — a shape change here would silently drop the seconds.
    expect((formatDateTimeLong(EPOCH, 'en-US').match(/:/g) ?? []).length).toBe(2)
  })

  it('formatExactDate and formatShortDate follow the language too', () => {
    expect(formatExactDate(EPOCH, 'en-US')).not.toEqual(formatExactDate(EPOCH, 'fr-FR'))
    expect(formatShortDate(EPOCH, 'en-US')).not.toEqual(formatShortDate(EPOCH, 'fr-FR'))
  })
})

describe('formatRelativeTime', () => {
  // Freeze the clock so the relative computation is deterministic.
  afterEach(() => vi.useRealTimers())

  function frozenNowSec(): number {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2021-06-15T12:00:00Z'))
    return Math.floor(Date.now() / 1000)
  }

  it('localizes days into French', () => {
    expect(formatRelativeTime(frozenNowSec() - 5 * 86400, 'fr')).toBe('il y a 5 jours')
  })

  it('localizes days into English', () => {
    expect(formatRelativeTime(frozenNowSec() - 5 * 86400, 'en')).toBe('5 days ago')
  })

  it('uses the "now" wording for the current instant', () => {
    expect(formatRelativeTime(frozenNowSec(), 'en')).toBe('now')
  })
})
