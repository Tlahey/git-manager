import { describe, it, expect } from 'vitest'
import { hoursForSummaryWindow, isSameLocalDay, isSummaryStale } from './dailySummaryWindow'

describe('hoursForSummaryWindow', () => {
  it('reaches back to the start of yesterday on a regular weekday', () => {
    // Wednesday 2024-06-05, 10:00 local → window starts Tue 00:00 → 34h.
    const now = new Date(2024, 5, 5, 10, 0, 0)
    expect(hoursForSummaryWindow(now)).toBe(34)
  })

  it('reaches back through the weekend to Friday on a Monday', () => {
    // Monday 2024-06-10, 09:00 → window starts Fri 00:00 (3 days back) → 3*24 + 9 = 81h.
    const now = new Date(2024, 5, 10, 9, 0, 0)
    expect(hoursForSummaryWindow(now)).toBe(81)
  })

  it('reaches back to Friday on a Sunday', () => {
    // Sunday 2024-06-09, 09:00 → window starts Fri 00:00 (2 days back) → 2*24 + 9 = 57h.
    const now = new Date(2024, 5, 9, 9, 0, 0)
    expect(hoursForSummaryWindow(now)).toBe(57)
  })

  it('never returns less than one hour', () => {
    const now = new Date(2024, 5, 5, 0, 0, 0)
    expect(hoursForSummaryWindow(now)).toBeGreaterThanOrEqual(1)
  })
})

describe('isSameLocalDay', () => {
  it('is true within the same day and false across midnight', () => {
    const morning = new Date(2024, 5, 5, 8, 0, 0).getTime()
    const evening = new Date(2024, 5, 5, 23, 0, 0).getTime()
    const nextDay = new Date(2024, 5, 6, 1, 0, 0).getTime()
    expect(isSameLocalDay(morning, evening)).toBe(true)
    expect(isSameLocalDay(evening, nextDay)).toBe(false)
  })
})

describe('isSummaryStale', () => {
  it('treats a missing timestamp as stale', () => {
    expect(isSummaryStale(null)).toBe(true)
    expect(isSummaryStale(undefined)).toBe(true)
  })

  it('is fresh when generated on the same day, stale otherwise', () => {
    const now = new Date(2024, 5, 5, 12, 0, 0).getTime()
    const earlierToday = new Date(2024, 5, 5, 6, 0, 0).getTime()
    const yesterday = new Date(2024, 5, 4, 23, 0, 0).getTime()
    expect(isSummaryStale(earlierToday, now)).toBe(false)
    expect(isSummaryStale(yesterday, now)).toBe(true)
  })
})
