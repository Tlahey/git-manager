/**
 * How a notification is presented, and for how long — the two user-facing display settings.
 *
 * Lives here rather than in the settings page because three unrelated places need the same
 * answer: the Settings combobox that writes it, the delivery policy that picks a surface from it
 * (`notchDelivery.ts`), and the notch window itself (a *separate* webview) that times its own
 * auto-dismiss with it. Each of those restating its own default is how they drift.
 */

import type { NotificationDisplayStyle, NotificationSettings } from '@git-manager/git-types'

/** The app's own card. The default: it's the surface this project actually designed. */
export const DEFAULT_DISPLAY_STYLE: NotificationDisplayStyle = 'notch'
export const DEFAULT_DISPLAY_DURATION_MS = 5000

/**
 * Module-level, so these hold i18n *keys* rather than copy — resolved through `t()` at render,
 * the same convention as `EVENT_TOGGLES` in the settings page.
 *
 * Each option carries a second line, because the choice is not only cosmetic: it decides how many
 * notifications the app raises at all (see `notchDelivery.ts`). A user picking "macOS banner"
 * should know they are also turning off progress and background-task cards, not just changing
 * where the same notifications appear.
 */
export const DISPLAY_STYLE_OPTIONS: Array<{
  value: NotificationDisplayStyle
  labelKey: string
  descKey: string
}> = [
  {
    value: 'notch',
    labelKey: 'notifications.settings.displayStyleNotch',
    descKey: 'notifications.settings.displayStyleNotchDesc',
  },
  {
    value: 'native',
    labelKey: 'notifications.settings.displayStyleNative',
    descKey: 'notifications.settings.displayStyleNativeDesc',
  },
]

/** `0` = stays until the user dismisses it; see `resolveDisplayDurationMs`. */
export const DISPLAY_DURATION_OPTIONS_MS = [3000, 5000, 8000, 12000, 0]

/**
 * Maps a persisted value onto a current one.
 *
 * `'popover'` was this style's name while the card was a menu-bar popover. `settings.store` deep-
 * merges what it rehydrates from localStorage, so an old snapshot keeps handing that string over
 * long after the union stopped containing it — and an unmapped value would silently fall through
 * to `native`, quietly turning the notch off for every existing user. Same shape as
 * `migrateAiPresetId`.
 */
export function migrateDisplayStyle(stored: string | undefined): NotificationDisplayStyle | undefined {
  if (stored === undefined) return undefined
  if (stored === 'popover') return 'notch'
  return stored === 'notch' || stored === 'native' ? stored : undefined
}

export function resolveDisplayStyle(
  notifications: NotificationSettings | undefined
): NotificationDisplayStyle {
  return migrateDisplayStyle(notifications?.displayStyle) ?? DEFAULT_DISPLAY_STYLE
}

/**
 * The notch card's auto-dismiss delay, or `null` for "no timer" — which is what `0` means in the
 * stored setting. Returning `null` rather than `0` or `Infinity` keeps the caller from arming a
 * `setTimeout` that would fire immediately.
 */
export function resolveDisplayDurationMs(
  notifications: NotificationSettings | undefined
): number | null {
  const stored = notifications?.displayDurationMs ?? DEFAULT_DISPLAY_DURATION_MS
  return stored > 0 ? stored : null
}
