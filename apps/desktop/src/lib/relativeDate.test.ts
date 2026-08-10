import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatExactDate,
  formatRelativeTime,
  formatRelativeTimeCompact,
  formatShortDate,
  formatDateTimeLong,
} from './relativeDate'

describe('formatRelativeTimeCompact', () => {
  const NOW = new Date('2024-06-15T12:00:00.000Z')
  const ago = (ms: number) => new Date(NOW.getTime() - ms)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // These are the exact strings the two hand-rolled formatters this replaced used to produce.
  // They are asserted so a future style change (`narrow` → `short`) cannot silently widen the
  // 52px "updated" column in the Launchpad and the 60px-minimum date column in the graph.
  it('keeps the compact English wording the columns were sized for', () => {
    expect(formatRelativeTimeCompact(ago(30_000), 'en')).toBe('30s ago')
    expect(formatRelativeTimeCompact(ago(5 * 60_000), 'en')).toBe('5m ago')
    expect(formatRelativeTimeCompact(ago(3 * 3_600_000), 'en')).toBe('3h ago')
    expect(formatRelativeTimeCompact(ago(5 * 86_400_000), 'en')).toBe('5d ago')
    expect(formatRelativeTimeCompact(ago(90 * 86_400_000), 'en')).toBe('3mo ago')
    expect(formatRelativeTimeCompact(ago(2 * 365 * 86_400_000), 'en')).toBe('2y ago')
  })

  it('crosses to the next unit at each boundary', () => {
    expect(formatRelativeTimeCompact(ago(60_000), 'en')).toBe('1m ago')
    expect(formatRelativeTimeCompact(ago(3_600_000), 'en')).toBe('1h ago')
  })

  /** The whole reason the hand-rolled versions had to go: they printed English in a French UI. */
  it('speaks French when the app does', () => {
    expect(formatRelativeTimeCompact(ago(5 * 60_000), 'fr')).toBe('-5 min')
    expect(formatRelativeTimeCompact(ago(3 * 3_600_000), 'fr')).toBe('-3 h')
    expect(formatRelativeTimeCompact(ago(5 * 86_400_000), 'fr')).toBe('-5 j')
  })

  /** `numeric: 'auto'` — the two places the CLDR wording differs from the old hand-rolled one. */
  it('uses the idiomatic word where the locale has one', () => {
    expect(formatRelativeTimeCompact(NOW, 'en')).toBe('now')
    expect(formatRelativeTimeCompact(NOW, 'fr')).toBe('maintenant')
    expect(formatRelativeTimeCompact(ago(86_400_000), 'en')).toBe('yesterday')
    expect(formatRelativeTimeCompact(ago(86_400_000), 'fr')).toBe('hier')
  })

  /** Git hands us epoch seconds, the GitHub API layer hands us `Date`s; both have to work, and a
   * number must stay seconds — reading it as milliseconds would put every commit in 1970. */
  it('accepts epoch seconds as well as a Date', () => {
    const fiveMinutesAgoSec = Math.floor(NOW.getTime() / 1000) - 5 * 60
    expect(formatRelativeTimeCompact(fiveMinutesAgoSec, 'en')).toBe('5m ago')
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

  it('accepts a Date as well as epoch seconds', () => {
    const now = frozenNowSec()
    expect(formatRelativeTime(new Date((now - 5 * 86400) * 1000), 'en')).toBe('5 days ago')
  })
})
