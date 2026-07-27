/**
 * Day helpers for the daily-summary feature. Pure (no React, no Tauri), so the fiddly part — what a
 * "day" is, in the user's own time zone — is unit-testable on its own.
 *
 * A briefing is about **one local calendar day**, and is filed under that day. It used to be about
 * "the last N hours" and filed under the day it was *written*, which meant a file named Tuesday
 * describing Monday's work — readable the morning you generated it, confusing two months later in an
 * archive you are searching by date.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * The `YYYY-MM-DD` key a briefing is filed and archived under — the **local** calendar day.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that converts to UTC first, so anyone west of
 * Greenwich generating a briefing in the evening would file it under tomorrow, and the file would
 * land in a day the user never worked.
 */
export function localDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The day the morning auto-run summarizes: the previous **working** day.
 *
 * On a Monday it reaches back over the weekend to Friday, and on a Sunday to Friday, so a fresh week
 * doesn't open on an empty briefing about a day nobody worked.
 */
export function previousWorkingDayKey(now: Date = new Date()): string {
  const day = now.getDay() // 0 = Sunday, 1 = Monday, … 6 = Saturday
  const daysBack = day === 1 ? 3 : day === 0 ? 2 : 1
  return localDateKey(new Date(now.getTime() - daysBack * MS_PER_DAY))
}

/** The half-open… actually inclusive epoch-second bounds of one local calendar day. */
export interface DayBounds {
  /** Local midnight opening the day. */
  sinceEpoch: number
  /** Last second of the day, local. */
  untilEpoch: number
}

/**
 * Turns a `YYYY-MM-DD` key into the epoch-second bounds the backend walks.
 *
 * Built from the local `Date` constructor rather than `Date.parse('2026-07-27')` — that parses a
 * bare date as **UTC midnight**, which in any non-zero offset is a different day than the one the
 * user picked in the date field.
 */
export function dayBounds(dateKey: string): DayBounds {
  const [year, month, day] = dateKey.split('-').map(Number)
  const start = new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0)
  const end = new Date(year, (month ?? 1) - 1, day ?? 1, 23, 59, 59, 999)
  return {
    sinceEpoch: Math.floor(start.getTime() / 1000),
    untilEpoch: Math.floor(end.getTime() / 1000),
  }
}

/** Whether a `YYYY-MM-DD` key is a day that hasn't finished yet (or hasn't started). */
export function isFutureDay(dateKey: string, now: Date = new Date()): boolean {
  return dateKey > localDateKey(now)
}

/**
 * Whether the archive is missing the briefing the morning run would write — i.e. there is no entry
 * for the previous working day.
 *
 * `dates` is the set of days a repository already has archived.
 */
export function isSummaryStale(dates: string[], now: Date = new Date()): boolean {
  return !dates.includes(previousWorkingDayKey(now))
}
