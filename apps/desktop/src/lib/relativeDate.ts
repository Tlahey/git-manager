/** Human-friendly date helpers for commit timestamps (Unix epoch seconds).
 * Extracted from `GraphRow` so the blame gutter / history panel format dates the same way. */

import type { TFunction } from '@git-manager/i18n'

/**
 * Coarse relative time from a **millisecond** epoch, worded through the `time.*` locale keys.
 *
 * Distinct from `formatRelativeTime` below on both counts: this one is for the app's *own* event
 * timestamps (`Date.now()`, e.g. `AppNotification.createdAt`) and its copy lives in our locale
 * files, where `formatRelativeTime` formats a *second*-based git timestamp through `Intl`.
 * Shared by the bell dropdown and the tray popover so the same notification can't read
 * "Just now" in one and something else in the other.
 */
export function formatRelativeTimestamp(timestampMs: number, t: TFunction): string {
  const seconds = Math.floor((Date.now() - timestampMs) / 1000)
  if (seconds < 60) return t('time.justNow')

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('time.minutesAgo', { count: minutes })

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('time.hoursAgo', { count: hours })

  return t('time.daysAgo', { count: Math.floor(hours / 24) })
}

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

/**
 * Coarse relative time from a `Date`, e.g. `12s ago`, `5m ago`, `3d ago`, `2mo ago`.
 *
 * The GitHub-side variant: it takes a `Date` (what the GitHub API layer builds) rather than an
 * epoch, and counts seconds instead of collapsing the first minute to "just now". Read by the
 * Launchpad rows and by the graph sidebar's issue hover card, which is why it sits here rather
 * than inside either feature.
 *
 * It is a near-duplicate of `formatRelativeDate` above and neither is localized — both should
 * fold into `formatRelativeTime`, which is. Kept as-is for now so this move changed no wording.
 */
export function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return `${Math.floor(d / 30)}mo ago`
}

/**
 * Locale-formatted absolute date/time, for tooltips.
 *
 * `locale` is the app's own language (`i18n.language`), and every caller must pass it. Omitting
 * it falls back to the **system** locale, which is not the same thing: an app running in English
 * on a French macOS printed "03 août 2026 à 14:20:18" next to otherwise English copy — the bug
 * that prompted routing every date site through these helpers.
 */
export function formatExactDate(timestamp: number, locale?: string): string {
  return new Date(timestamp * 1000).toLocaleString(locale)
}

/** Locale-formatted date only (no time), for the blame column. See `formatExactDate` on `locale`. */
export function formatShortDate(timestamp: number, locale?: string): string {
  return new Date(timestamp * 1000).toLocaleDateString(locale)
}

/**
 * `12 Mar 2026, 14:20:18` — the long form the commit-details header and the rebase editor show.
 *
 * Spelled-out month rather than a numeric one because this is the one place a commit's date is
 * read rather than scanned, and `03/08` is ambiguous across locales in a way `3 Aug` is not.
 */
export function formatDateTimeLong(timestamp: number, locale?: string): string {
  return new Date(timestamp * 1000).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
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
