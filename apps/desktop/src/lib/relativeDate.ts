/** Human-friendly date helpers for commit timestamps (Unix epoch seconds).
 * Extracted from `GraphRow` so the blame gutter / history panel format dates the same way. */

/** Coarse relative time, e.g. `just now`, `5m ago`, `3d ago`, `2y ago`. */
export function formatRelativeDate(timestamp: number): string {
  const now = Date.now() / 1000
  const diff = now - timestamp

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`
  return `${Math.floor(diff / (86400 * 365))}y ago`
}

/** Locale-formatted absolute date/time, for tooltips. */
export function formatExactDate(timestamp: number, locale?: string): string {
  return new Date(timestamp * 1000).toLocaleString(locale)
}

/** Locale-formatted date only (no time), for the blame column. */
export function formatShortDate(timestamp: number, locale?: string): string {
  return new Date(timestamp * 1000).toLocaleDateString(locale)
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/** Localized relative time (e.g. `il y a 5 jours`, `5 days ago`, `maintenant`, `now`) using
 * `Intl.RelativeTimeFormat`. `numeric: 'auto'` yields idiomatic wording (`yesterday` / `hier`,
 * `now` / `maintenant`) for the nearest units. */
export function formatRelativeTime(timestamp: number, locale?: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const diffSec = Math.round(timestamp - Date.now() / 1000) // negative = in the past
  const abs = Math.abs(diffSec)
  for (const [unit, secs] of RELATIVE_UNITS) {
    if (abs >= secs) {
      return rtf.format(Math.round(diffSec / secs), unit)
    }
  }
  return rtf.format(0, 'second')
}
