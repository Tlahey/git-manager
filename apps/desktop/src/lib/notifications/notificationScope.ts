/**
 * Whose pull requests an event notifies about — the per-event audience filter.
 *
 * Lives beside `notificationDisplay.ts` and for the same reason: two unrelated places need the same
 * answer, the Settings selects that write it and the watcher that filters on it
 * (`notificationRegistry.ts`'s `isNotificationInScope`). Each restating its own default is how they
 * drift.
 *
 * The narrowing is real rather than cosmetic, because the app's PR list is the union of
 * `author:me` and `review-requested:me` (see `api/github/github-pulls.api.ts`): on a busy team most
 * of the volume is the second set, and `mine` is the user saying they only want the first.
 */

import type {
  NotificationScope,
  NotificationScopeKey,
  NotificationSettings,
} from '@git-manager/git-types'

/**
 * `all` — the behaviour every existing install has, so an upgrade adds a control and silences
 * nothing. A user who wants fewer notifications has to ask for fewer.
 */
export const DEFAULT_NOTIFICATION_SCOPE: NotificationScope = 'all'

/**
 * Module-level, so these hold i18n *keys* rather than copy — resolved through `t()` at render, the
 * same convention as `DISPLAY_STYLE_OPTIONS` and the event toggles.
 */
export const NOTIFICATION_SCOPE_OPTIONS: Array<{
  value: NotificationScope
  labelKey: string
}> = [
  { value: 'all', labelKey: 'notifications.settings.scopeAll' },
  { value: 'mine', labelKey: 'notifications.settings.scopeMine' },
]

/**
 * The scope stored for one event, or the default.
 *
 * Unrecognized values fall back rather than being trusted: the setting round-trips through a
 * hand-editable JSON file (`~/.git-manager/settings.json`), whose schema deliberately accepts any
 * string here so that one typo can't invalidate the whole `notifications` group.
 */
export function resolveNotificationScope(
  key: NotificationScopeKey,
  notifications: NotificationSettings | undefined
): NotificationScope {
  const stored = notifications?.scopes?.[key]
  return stored === 'all' || stored === 'mine' ? stored : DEFAULT_NOTIFICATION_SCOPE
}

/**
 * Whether `author` is the signed-in user.
 *
 * Case-insensitive, like every other login comparison in the app (GitHub logins are), and `false`
 * for an unknown user — callers decide what to do with that rather than getting a silent "yes".
 */
export function isAuthoredByCurrentUser(
  author: string | undefined,
  currentUser: string | null | undefined
): boolean {
  if (!author || !currentUser) return false
  return author.toLowerCase() === currentUser.toLowerCase()
}
