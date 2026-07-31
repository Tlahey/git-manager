/**
 * Which surface a notification goes to — and, for a good number of them, whether it is raised at
 * all.
 *
 * The display setting is not a skin. The notch is *our* surface: it queues, it updates in place,
 * it dismisses itself, and it costs the user nothing to ignore. That is what makes it able to
 * carry things a banner cannot — a clone ticking towards 100 %, a pre-commit hook running, a dev
 * server coming up. A macOS banner is one immutable line that lands in Notification Centre and
 * stays there; turning a clone into a banner would mean forty banners for one operation, and
 * turning every background task into one would train the user to swipe them all away.
 *
 * So the two styles genuinely differ in *coverage*, not just in appearance, and this module is
 * where that is decided — once, for the watcher, the fallback path and the Settings test button
 * alike.
 */

import type { NotificationSettings } from '@git-manager/git-types'
import type { NotchModel, NotchQueueEntry } from '@git-manager/notch'
import type { NativeNotificationSpec } from '../../api/notification.api'
import type { AppNotification } from '../../stores/notification.store'
import type { NotificationRoute } from './notificationRoute'
import { resolveDisplayStyle } from './notificationDisplay'

/**
 * How much a card is worth interrupting for.
 *
 * - `key` — a discrete thing the user asked to hear about: a review requested, a PR merged, a hook
 *   that failed and stopped their commit. Worth a banner if the notch isn't available.
 * - `ambient` — worth showing on a surface that costs nothing to ignore, and not worth a permanent
 *   entry in Notification Centre: progress, a background scan finishing, a dev server restarting.
 */
export type NotchImportance = 'key' | 'ambient'

/**
 * A card, ready to be delivered — everything the notch window needs plus the policy field that
 * decides whether it is shown and where.
 *
 * Extends the package's queue entry, so a request can be queued as-is: the queue orders on
 * `model`, and the route, the icon key and the importance ride along instead of being kept in a
 * parallel map that has to stay in step.
 */
export interface NotchRequest extends NotchQueueEntry {
  model: NotchModel
  importance: NotchImportance
  /** Key for the header glyph, resolved to a component inside the notch window. */
  iconId?: AppNotification['type']
  /** Where the `activate` action (and a click on the card) takes the user. */
  route?: NotificationRoute
  /** What the `open-external` action opens. */
  externalUrl?: string
  /**
   * The OS banner to raise instead of the card — when the user asked for banners, or when the
   * notch could not be shown at all.
   *
   * Built by the producer, because it is the only thing that has the translated copy and the
   * route. Absent simply means this card has no banner form; the policy below decides whether one
   * would even be wanted. It is stripped before the request reaches the notch window.
   */
  nativeFallback?: NativeNotificationSpec
  /**
   * Skip the policy below and go to this surface.
   *
   * For the debug menu, which exists to aim a card at a surface on purpose — "show me this on the
   * notch" has to mean the notch even when the user's own setting says banners, or the button
   * would be testing the setting rather than the card. Nothing else sets it.
   */
  forceSurface?: NotificationSurface
}

export type NotificationSurface = 'notch' | 'native' | 'none'

/**
 * The banner form of a card that did not bring its own.
 *
 * Derived rather than required from each producer, because "every `key` card needs a
 * `nativeFallback`" is precisely the kind of rule that gets forgotten by the next producer — and
 * the symptom is silence: the user picked the macOS banner, the card was never eligible for the
 * notch, and nothing at all was shown. That is what happened to the transfer and search cards.
 *
 * The result is plainer than a hand-written one — an eyebrow and a title, no per-feature sentence —
 * so a producer with real copy to offer (the PR notifications) still supplies its own.
 */
export function nativeSpecFromModel(model: NotchModel): NativeNotificationSpec {
  return {
    title: model.eyebrow,
    body: model.context ? `${model.title} — ${model.context}` : model.title,
    // Nowhere to navigate to: these are cards about the app's own work, and the click has already
    // brought the window forward.
    route: { kind: 'app' },
  }
}

/** The banner to send for a request, its own if it has one and a derived one otherwise. */
export function nativeSpecFor(request: NotchRequest): NativeNotificationSpec {
  return request.nativeFallback ?? nativeSpecFromModel(request.model)
}

/**
 * Whether this card can survive being flattened into an OS banner.
 *
 * Two things disqualify it. A `progress` card is *live* — its whole point is a number that
 * changes, and a banner is written once; delivering one would either freeze at the first value or
 * emit a banner per tick. And an `ambient` card is, by definition, not worth a permanent entry in
 * Notification Centre.
 *
 * A `status` card is fine: a hook that failed is a finished, discrete fact, and the tail of its
 * output simply doesn't come along.
 */
export function isEligibleForNativeBanner(request: NotchRequest): boolean {
  if (request.model.kind === 'progress') return false
  return request.importance === 'key'
}

/**
 * Where this card should go, given the user's settings.
 *
 * `none` is a real answer, not a failure: it is what "you chose the macOS banner, and this is a
 * progress card" looks like. The caller drops the request rather than degrading it into something
 * the user did not ask for.
 */
export function resolveNotificationSurface(
  request: NotchRequest,
  notifications: NotificationSettings | undefined
): NotificationSurface {
  // Deliberately ahead of the "notifications off" check: a forced surface is a developer aiming a
  // card at one, and silently swallowing it would make the button look broken.
  if (request.forceSurface) return request.forceSurface
  if (!(notifications?.enabled ?? true)) return 'none'
  if (resolveDisplayStyle(notifications) === 'notch') return 'notch'
  return isEligibleForNativeBanner(request) ? 'native' : 'none'
}

/**
 * What to do when the notch was the right surface but the card could not be shown — no tray rect
 * (Linux), or window creation failed.
 *
 * Deliberately the same filter as the explicit `native` choice. The fallback exists so a *key*
 * notification is never lost, not so that everything the notch would have shown gets dumped into
 * Notification Centre the one time a window failed to open.
 */
export function resolveNotchFallbackSurface(request: NotchRequest): 'native' | 'none' {
  return isEligibleForNativeBanner(request) ? 'native' : 'none'
}
