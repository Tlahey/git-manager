/** Time-window helpers for the daily-summary feature. Kept pure (no React, no Tauri) so the
 * "what counts as yesterday" logic — the fiddly part — is unit-testable on its own. */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Number of hours to look back so the briefing covers "yesterday's" work, measured from `now` to
 * the start of the previous working day. On a Monday it reaches back through the weekend to Friday,
 * and on a Sunday back to Friday, so a fresh week doesn't open with an empty summary. */
export function hoursForSummaryWindow(now: Date = new Date()): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = now.getDay() // 0 = Sunday, 1 = Monday, … 6 = Saturday
  const daysBack = day === 1 ? 3 : day === 0 ? 2 : 1
  const windowStart = startOfToday - daysBack * MS_PER_DAY
  return Math.max(1, Math.round((now.getTime() - windowStart) / (60 * 60 * 1000)))
}

/** Whether two epoch-millisecond instants fall on the same local calendar day. */
export function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** A stored summary is stale once it wasn't generated on the current local day — i.e. it's a new
 * morning and the briefing should be refreshed. `undefined`/`null` (never generated) is stale. */
export function isSummaryStale(generatedAt: number | null | undefined, now: number = Date.now()): boolean {
  if (generatedAt == null) return true
  return !isSameLocalDay(generatedAt, now)
}
