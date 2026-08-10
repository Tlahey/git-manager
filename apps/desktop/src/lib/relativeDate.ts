/**
 * Human-friendly date helpers. Every date the app shows goes through one of these, and every one
 * of them takes the app's own language — see `formatExactDate` on why omitting it is a bug rather
 * than a default.
 *
 * Timestamps are Unix epoch **seconds** (what git hands us) except where a `Date` is accepted
 * (what the GitHub API layer builds) or milliseconds are named explicitly.
 *
 * Extracted from `GraphRow` so the blame gutter / history panel format dates the same way.
 */

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

/**
 * Epoch **seconds** from either input shape.
 *
 * A `Date` is accepted because the GitHub API layer builds them (`MockPR.updatedAt`) while git
 * timestamps arrive as second-based numbers, and converting at four call sites is four chances to
 * divide by 1000 in the wrong direction. A bare number is still seconds — the ms/seconds confusion
 * has bitten this file before (see `formatRelativeTimestamp`), and `Date` is the unambiguous form.
 */
function toEpochSeconds(when: number | Date): number {
  return when instanceof Date ? when.getTime() / 1000 : when
}

function relativeTime(
  when: number | Date,
  locale: string | undefined,
  style: Intl.RelativeTimeFormatStyle
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style })
  const diffSec = Math.round(toEpochSeconds(when) - Date.now() / 1000) // negative = in the past
  const abs = Math.abs(diffSec)
  for (const [unit, secs] of RELATIVE_UNITS) {
    if (abs >= secs) {
      return rtf.format(Math.round(diffSec / secs), unit)
    }
  }
  return rtf.format(0, 'second')
}

/** Localized relative time (e.g. `il y a 5 jours`, `5 days ago`, `maintenant`, `now`) using
 * `Intl.RelativeTimeFormat`. `numeric: 'auto'` yields idiomatic wording (`yesterday` / `hier`,
 * `now` / `maintenant`) for the nearest units. */
export function formatRelativeTime(when: number | Date, locale?: string): string {
  return relativeTime(when, locale, 'long')
}

/**
 * The same thing in `Intl`'s **narrow** style — `5s ago`, `2h ago`, `3d ago`, `-2 h`, `hier`.
 *
 * For the columns that are too narrow for the long form: the Launchpad's "updated" column is 52px
 * and the graph's date column can be dragged down to 60, where `il y a 2 heures` is a truncation
 * rather than a date. Narrow is what makes those columns work in French without widening them at
 * the expense of the PR title and the commit message beside them.
 *
 * It replaced two hand-rolled formatters that hardcoded English (`5m ago` in a French UI). In
 * English the narrow CLDR forms are word-for-word what those produced, so nothing moved for an
 * English reader beyond `just now` → `now` and `1d ago` → `yesterday`.
 */
export function formatRelativeTimeCompact(when: number | Date, locale?: string): string {
  return relativeTime(when, locale, 'narrow')
}
