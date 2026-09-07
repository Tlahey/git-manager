import type { NotificationScopeKey, NotificationSettings } from '@git-manager/git-types'

/**
 * The per-event rows of Settings › Notifications, in the order a pull request goes through them
 * (local git ops first, then the PR lifecycle: opened → review → CI → queued → merged/closed).
 *
 * A colocated config rather than an array inside the section component, per the repo's rule for a
 * lookup table keyed by a fixed set of values: each row now carries three unrelated things (its
 * settings key, its copy, and whether it has an audience filter), and a row's `scopeKey` has to be
 * readable next to the `NOTIFICATION_TYPES` entry it mirrors rather than buried in JSX.
 *
 * Module-level, so these hold i18n *keys* rather than copy — resolved through `t()` at render.
 */
export interface NotificationEventToggle {
  key: keyof NotificationSettings
  titleKey: string
  descKey: string
  /**
   * The event's audience filter, when it has one. Absent for the local git events (they have no PR
   * to belong to) and for review requests (never on your own PR — see `NotificationScopeKey`).
   *
   * Always equal to `key` where present: the scope narrows exactly what its own checkbox gates, so
   * one entry covers both CI outcomes and one covers both terminal PR states, the same way the
   * toggles already do.
   */
  scopeKey?: NotificationScopeKey
}

export const EVENT_TOGGLES: NotificationEventToggle[] = [
  {
    key: 'notifyOnFetch',
    titleKey: 'notifications.settings.fetchTitle',
    descKey: 'notifications.settings.fetchDesc',
  },
  {
    key: 'notifyOnPull',
    titleKey: 'notifications.settings.pullTitle',
    descKey: 'notifications.settings.pullDesc',
  },
  {
    key: 'notifyOnPush',
    titleKey: 'notifications.settings.pushTitle',
    descKey: 'notifications.settings.pushDesc',
  },
  {
    key: 'notifyOnTerminalFinished',
    titleKey: 'notifications.settings.terminalFinishedTitle',
    descKey: 'notifications.settings.terminalFinishedDesc',
  },
  {
    key: 'notifyOnNewPr',
    titleKey: 'notifications.settings.newPrTitle',
    descKey: 'notifications.settings.newPrDesc',
    scopeKey: 'notifyOnNewPr',
  },
  {
    key: 'notifyOnReviewRequested',
    titleKey: 'notifications.settings.reviewRequestedTitle',
    descKey: 'notifications.settings.reviewRequestedDesc',
  },
  {
    key: 'notifyOnReviewStatusChanged',
    titleKey: 'notifications.settings.reviewStatusTitle',
    descKey: 'notifications.settings.reviewStatusDesc',
    scopeKey: 'notifyOnReviewStatusChanged',
  },
  {
    key: 'notifyOnCi',
    titleKey: 'notifications.settings.ciTitle',
    descKey: 'notifications.settings.ciDesc',
    scopeKey: 'notifyOnCi',
  },
  {
    key: 'notifyOnPrQueued',
    titleKey: 'notifications.settings.prQueuedTitle',
    descKey: 'notifications.settings.prQueuedDesc',
    scopeKey: 'notifyOnPrQueued',
  },
  {
    key: 'notifyOnPrMerged',
    titleKey: 'notifications.settings.prMergedTitle',
    descKey: 'notifications.settings.prMergedDesc',
    scopeKey: 'notifyOnPrMerged',
  },
]
