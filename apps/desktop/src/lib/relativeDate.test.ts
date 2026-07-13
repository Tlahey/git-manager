import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  formatRelativeDate,
  formatExactDate,
  formatRelativeTime,
  formatShortDate,
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
