import { useEffect } from 'react'
import { hideAppSplash } from '../lib/appSplash'
import { useRepoUIStore, DASHBOARD_TAB, REWARDS_TAB } from '../stores/repoUI.store'
import { useGlobalLoadingStore, selectIsGlobalLoading } from '../stores/globalLoading.store'

/**
 * Tabs that render instantly and need no async data to be "ready" — the splash can drop as soon as
 * they paint. Everything else (a repo tab, or the Launchpad/Pull Requests tab) may still be loading,
 * so we wait for the global loading overlay to go idle before hiding the splash.
 */
const INSTANT_TABS = new Set<string>([DASHBOARD_TAB, REWARDS_TAB])

/** Never let the splash hang if the initial load stalls or errors out. */
const SPLASH_SAFETY_TIMEOUT_MS = 8000

/**
 * Keeps the startup splash on screen until the app is actually usable, then fades
 * it out — rather than dropping it on React's first frame (which flashes an empty
 * shell while a repo tab still loads its history).
 *
 * Readiness rule: if the restored active tab loads async data (a repo, or the
 * Launchpad/Pull Requests tab), wait for that initial load to finish (the global
 * loading overlay going idle); for the instant tabs (dashboard/rewards), which
 * paint immediately, hide right after first paint. A safety timeout guarantees
 * the splash never hangs.
 */
export function useAppReadySplash(): void {
  useEffect(() => {
    let done = false
    let unsubscribe: (() => void) | undefined

    const hide = () => {
      if (done) return
      done = true
      unsubscribe?.()
      clearTimeout(safety)
      hideAppSplash()
    }

    const safety = setTimeout(hide, SPLASH_SAFETY_TIMEOUT_MS)

    // Wait one frame so freshly-mounted children (e.g. GitGraph) can register their
    // initial-load into the global loading store before we sample it.
    const raf = requestAnimationFrame(() => {
      const activeTab = useRepoUIStore.getState().activeTab
      const waitsForData = !INSTANT_TABS.has(activeTab)
      const loading = selectIsGlobalLoading(useGlobalLoadingStore.getState())

      if (waitsForData && loading) {
        unsubscribe = useGlobalLoadingStore.subscribe((state) => {
          if (!selectIsGlobalLoading(state)) hide()
        })
      } else {
        hide()
      }
    })

    return () => {
      done = true
      cancelAnimationFrame(raf)
      unsubscribe?.()
      clearTimeout(safety)
    }
  }, [])
}
