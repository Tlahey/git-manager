import { describe, it, expect } from 'vitest'
import {
  dayBounds,
  isFutureDay,
  isSummaryStale,
  localDateKey,
  previousWorkingDayKey,
} from './dailySummaryWindow'

describe('localDateKey', () => {
  it('zero-pads month and day', () => {
    expect(localDateKey(new Date(2026, 6, 5, 10, 0, 0))).toBe('2026-07-05')
    expect(localDateKey(new Date(2026, 11, 25, 10, 0, 0))).toBe('2026-12-25')
  })

  /** `toISOString()` would convert to UTC first and file a late-evening briefing under tomorrow. */
  it('uses the local calendar day, not UTC', () => {
    expect(localDateKey(new Date(2026, 6, 27, 23, 30, 0))).toBe('2026-07-27')
  })
})

describe('previousWorkingDayKey', () => {
  it('is yesterday on a regular weekday', () => {
    // Wednesday 2024-06-05 → Tuesday.
    expect(previousWorkingDayKey(new Date(2024, 5, 5, 10, 0, 0))).toBe('2024-06-04')
  })

  /** A fresh week must not open on a briefing about a day nobody worked. */
  it('reaches back over the weekend to Friday on a Monday', () => {
    expect(previousWorkingDayKey(new Date(2024, 5, 10, 9, 0, 0))).toBe('2024-06-07')
  })

  it('reaches back to Friday on a Sunday', () => {
    expect(previousWorkingDayKey(new Date(2024, 5, 9, 9, 0, 0))).toBe('2024-06-07')
  })

  it('crosses a month boundary', () => {
    expect(previousWorkingDayKey(new Date(2024, 6, 1, 9, 0, 0))).toBe('2024-06-28')
  })
})

describe('dayBounds', () => {
  it('spans local midnight to the last second of the day', () => {
    const { sinceEpoch, untilEpoch } = dayBounds('2026-07-27')
    expect(sinceEpoch).toBe(Math.floor(new Date(2026, 6, 27, 0, 0, 0, 0).getTime() / 1000))
    expect(untilEpoch).toBe(Math.floor(new Date(2026, 6, 27, 23, 59, 59, 999).getTime() / 1000))
    expect(untilEpoch - sinceEpoch).toBe(24 * 60 * 60 - 1)
  })

  /** `Date.parse('2026-07-27')` is UTC midnight — a different day in any non-zero offset. */
  it('interprets the key in local time, not UTC', () => {
    const { sinceEpoch } = dayBounds('2026-07-27')
    expect(new Date(sinceEpoch * 1000).getDate()).toBe(27)
    expect(new Date(sinceEpoch * 1000).getHours()).toBe(0)
  })

  it('handles a day that ends a month', () => {
    const { untilEpoch } = dayBounds('2026-02-28')
    expect(new Date(untilEpoch * 1000).getMonth()).toBe(1)
    expect(new Date(untilEpoch * 1000).getDate()).toBe(28)
  })
})

describe('isFutureDay', () => {
  const now = new Date(2026, 6, 27, 12, 0, 0)

  it('is false for today and the past', () => {
    expect(isFutureDay('2026-07-27', now)).toBe(false)
    expect(isFutureDay('2026-07-26', now)).toBe(false)
  })

  it('is true for tomorrow', () => {
    expect(isFutureDay('2026-07-28', now)).toBe(true)
  })
})

describe('isSummaryStale', () => {
  // Wednesday, so the morning run targets Tuesday the 4th.
  const now = new Date(2024, 5, 5, 12, 0, 0)

  it('is stale when nothing is archived at all', () => {
    expect(isSummaryStale([], now)).toBe(true)
  })

  it('is fresh once the previous working day is archived', () => {
    expect(isSummaryStale(['2024-06-04'], now)).toBe(false)
  })

  /** Having *some* briefing isn't enough — it has to be the day the run is about. */
  it('is stale when only older days are archived', () => {
    expect(isSummaryStale(['2024-06-01', '2024-06-03'], now)).toBe(true)
  })
})
