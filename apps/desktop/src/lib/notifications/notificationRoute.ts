import type { AppNotification } from '../../stores/notification.store'
import type { AiPanelTarget } from '../../stores/repoUI.store'

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
   * Nowhere in particular — just bring the app forward.
   *
   * What a card about the app's *own* work routes to: a finished search, a rejected push, a dev
   * server that came up. There is no page to open; the user was already somewhere, and coming back
   * to it is the whole of what clicking meant. Raising the window is not this route's job either —
   * `focus_main_window` in `commands/notification.rs` has already done it by the time this arrives,
   * for every route.
   */
  | { kind: 'app' }
  /**
   * The panel an AI generation is running in.
   *
   * Carries the origin rather than a run id: a run is a live object that ends, and by the time a
   * card about it is clicked the generation may well be over — but "the panel where the answer is"
   * is still exactly where the user wants to land. `AiPanelTarget` is plain data, so it survives the
   * trip through Rust like everything else here.
   */
  | { kind: 'ai-run'; repoPath: string; panel?: AiPanelTarget }

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
