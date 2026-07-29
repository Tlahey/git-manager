import type { AppNotification } from '../../stores/notification.store'

/**
 * Where a notification takes the user when it is clicked — the OS banner and the bell dropdown
 * both resolve to one of these, so a click lands in the same place whichever surface it came from.
 *
 * A route is a plain serialisable value, not a callback, because it makes a round trip through
 * Rust: `send_native_notification` stores it and emits it back on `notification://activated`
 * (see `commands/notification.rs`, which never looks inside it). That also means it survives the
 * app window being hidden or the notification sitting in Notification Centre for a while, so the
 * route has to carry everything needed to navigate rather than an index into live state.
 *
 * Navigation itself lives in `notificationRouting.ts`; this module is only the vocabulary.
 */
export type NotificationRoute =
  | {
      kind: 'pull-request'
      /** Bell-dropdown entry to mark read on arrival. Absent for a notification with no entry. */
      notificationId?: number
      prNumber: number
      /** `MockPR.id` — how the Launchpad finds the PR again on the no-local-clone fallback. */
      prId: string
      /** Repo *name* (`git-manager`); the weaker fallback when `fullName` is unknown. */
      repo: string
      /** `owner/repo` — the reliable key for finding the local clone among the added repos. */
      fullName?: string
      /** Launchpad inner tab to land on when the repo has no local clone. */
      targetTab: AppNotification['targetTab']
    }
  /** An unlocked achievement — the Rewards tab, which is where the trophy lives. */
  | { kind: 'rewards' }

/**
 * The route for a bell notification. Every kind in `notificationRegistry.ts` is about one pull
 * request, so they all route the same way — what differs between them is the Launchpad tab they
 * fall back to, which the registry already resolves into `targetTab`.
 */
export function buildNotificationRoute(notif: AppNotification): NotificationRoute {
  return {
    kind: 'pull-request',
    notificationId: notif.id,
    prNumber: notif.prNumber,
    prId: notif.prId,
    repo: notif.repo,
    ...(notif.fullName ? { fullName: notif.fullName } : {}),
    targetTab: notif.targetTab,
  }
}
