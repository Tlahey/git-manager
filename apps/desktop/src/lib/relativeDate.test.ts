import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatRelativeDate,
  formatExactDate,
  formatRelativeTime,
  formatShortDate,
  formatDateTimeLong,
} from './relativeDate'

const nowSec = () => Math.floor(Date.now() / 1000)

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
