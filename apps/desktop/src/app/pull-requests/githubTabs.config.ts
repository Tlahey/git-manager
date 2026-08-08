import type { InnerTab } from './types'

/**
 * Which Launchpad tabs are backed by the signed-in GitHub account, and which stand on their own.
 *
 * Only `wip` is local: it lists uncommitted work across the repositories added to the app, read
 * straight from disk. Everything else — the user's pull requests, the issues on their repos, the
 * review queue, the snooze list, the contribution graph, the saved views over all of it — is that
 * account's data and shows nothing without it.
 *
 * A table rather than a `tab.id !== 'wip'` check at the call site, per the repo's convention for a
 * lookup keyed by a fixed set of values (see `components/git-graph/columns.config.ts`): a tab added
 * to `InnerTab` fails to compile until someone states which side of the line it falls on, which is
 * the whole point — the failure mode of the alternative is a tab silently offered to a signed-out
 * user and rendering blank.
 */
export const TAB_REQUIRES_GITHUB: Record<InnerTab, boolean> = {
  prs: true,
  wip: false,
  followed: true,
  issues: true,
  waiting: true,
  snoozed: true,
  stats: true,
  views: true,
}

/** The tabs shown when no GitHub account is connected, in their declared order. */
export const LOCAL_ONLY_TABS: InnerTab[] = (Object.keys(TAB_REQUIRES_GITHUB) as InnerTab[]).filter(
  (id) => !TAB_REQUIRES_GITHUB[id]
)

/**
 * The tab to actually render: `activeTab` itself when it is available, otherwise the first local
 * one. The active tab is persisted (see `stores/launchpad.store.ts`), so a user who signs out —
 * or who opens the app for the first time on a machine where a previous install left the store —
 * would otherwise land on a tab that is no longer in the bar and see an empty page with no tab
 * highlighted. Nothing is written back to the store: signing in must return the user to the tab
 * they left.
 */
export function resolveActiveTab(activeTab: InnerTab, githubConnected: boolean): InnerTab {
  if (githubConnected || !TAB_REQUIRES_GITHUB[activeTab]) return activeTab
  return LOCAL_ONLY_TABS[0]
}
