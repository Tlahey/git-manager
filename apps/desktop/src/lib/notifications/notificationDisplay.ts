/**
 * How a notification is presented, and for how long — the two user-facing display settings.
 *
 * Lives here rather than in the settings page because three unrelated places need the same
 * answer: the Settings combobox that writes it, `useNotificationWatcher`'s `notifyUser` that
 * picks a surface from it, and the popover window itself (a *separate* webview) that times its
 * own auto-dismiss with it. Each of those restating its own default is how they drift.
 */

import type { NotificationDisplayStyle, NotificationSettings } from '@git-manager/git-types'

/** The app's own card. The default: it's the surface this project actually designed. */
export const DEFAULT_DISPLAY_STYLE: NotificationDisplayStyle = 'popover'
export const DEFAULT_DISPLAY_DURATION_MS = 5000

/**
 * Module-level, so these hold i18n *keys* rather than copy — resolved through `t()` at render,
 * the same convention as `EVENT_TOGGLES` in the settings page.
 */
export const DISPLAY_STYLE_OPTIONS: Array<{
  value: NotificationDisplayStyle
  labelKey: string
}> = [
  { value: 'popover', labelKey: 'notifications.settings.displayStylePopover' },
  { value: 'native', labelKey: 'notifications.settings.displayStyleNative' },
]

/** `0` = stays until the user dismisses it; see `resolveDisplayDurationMs`. */
export const DISPLAY_DURATION_OPTIONS_MS = [3000, 5000, 8000, 12000, 0]

export function resolveDisplayStyle(
  notifications: NotificationSettings | undefined
): NotificationDisplayStyle {
  return notifications?.displayStyle ?? DEFAULT_DISPLAY_STYLE
}

/**
 * The popover's auto-dismiss delay, or `null` for "no timer" — which is what `0` means in the
 * stored setting. Returning `null` rather than `0` or `Infinity` keeps the caller from arming a
 * `setTimeout` that would fire immediately.
 */
export function resolveDisplayDurationMs(
  notifications: NotificationSettings | undefined
): number | null {
  const stored = notifications?.displayDurationMs ?? DEFAULT_DISPLAY_DURATION_MS
  return stored > 0 ? stored : null
}
