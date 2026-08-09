import { useLaunchpadStore } from '../../stores/launchpad.store'
import { useNotificationStore } from '../../stores/notification.store'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore, PULL_REQUESTS_TAB, REWARDS_TAB } from '../../stores/repoUI.store'
import { goToRepoContent } from '../../stores/repoView.store'
import { findLocalRepoPath } from './findLocalRepo'
import { goToAiRun } from '../aiRunPresentation'
import type { NotificationRoute } from './notificationRoute'

/**
 * Navigates the app to where a clicked notification points — the single implementation behind both
 * click surfaces (the macOS banner, via `notification://activated`, and the bell dropdown), so the
 * two can't drift into landing in different places for the same notification.
 *
 * Imperative store access (`getState()`) rather than hooks: the OS banner's click arrives from a
 * Tauri event listener, with no component in scope, and possibly while the app is hidden.
 */
export async function routeNotification(route: NotificationRoute): Promise<void> {
  // Deliberately does nothing: the app has already been brought forward by the time this runs, and
  // that was the entire intent. Navigating anywhere would take the user away from whatever they
  // were doing when the card appeared.
  if (route.kind === 'app') return

  if (route.kind === 'rewards') {
    useRepoUIStore.getState().setActiveTab(REWARDS_TAB)
    return
  }

  if (route.kind === 'ai-run') {
    // The same handoff the footer's busy pill performs — one implementation, so a card and the pill
    // can't land in different places for the same generation.
    goToAiRun({ repoPath: route.repoPath, ...(route.panel ? { panel: route.panel } : {}) })
    return
  }

  if (route.notificationId != null) {
    useNotificationStore.getState().markAsRead(route.notificationId)
  }

  const repoPath = await findLocalRepoPath(
    { fullName: route.fullName, name: route.repo },
    useRepoDataStore.getState().savedRepos
  )

  if (repoPath) {
    // The in-app PR page, in the repo the PR belongs to — the same view the sidebar's Pull
    // Requests section opens. `openTab` focuses the tab if the repo already has one.
    useRepoDataStore.getState().markRepoOpened(repoPath)
    useRepoUIStore.getState().openTab(repoPath)
    // The PR page is drawn by the graph view alone. Without this, a card clicked while the tab was
    // last left on the board or the files view sets `activePrNumber` under a screen that renders
    // neither — the app comes forward and shows the Kanban the user had already seen.
    goToRepoContent()
    useRepoUIStore.getState().setActivePrNumber(route.prNumber)
    return
  }

  // No local clone to open the PR page against (the user follows the repo on GitHub but hasn't
  // added it). The Launchpad is the one place that knows the PR anyway, so land on the tab the
  // notification's kind belongs to and ask it to open the PR's panel once its list has loaded.
  useRepoUIStore.getState().setActiveTab(PULL_REQUESTS_TAB)
  useLaunchpadStore.getState().setActiveTab(route.targetTab)
  useLaunchpadStore.getState().requestOpenPr(route.prId)
}
