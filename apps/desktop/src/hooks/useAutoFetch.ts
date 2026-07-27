import { useCallback, useEffect, useRef } from 'react'
import { queryClient } from '../lib/queryClient'
import { apiFetchRemote } from '../api/git.api'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useSettingsStore } from '../stores/settings.store'
import { useWindowFocus } from './useWindowFocus'

/** Matches the store default and the Settings input's ceiling (`GeneralSection`). */
const DEFAULT_INTERVAL_MINUTES = 1
const MAX_INTERVAL_MINUTES = 60

/**
 * Background `git fetch` of the ACTIVE repository, every
 * `settings.git.autoFetchIntervalMinutes` minutes (0 disables it), and **only while the app window
 * has focus** — an unattended window must not keep hitting the remote, and the point of the refresh
 * is that what the user is looking at is up to date.
 *
 * Deliberately silent: no toast on success, and errors (offline, missing credentials, a remote
 * that's gone) are swallowed. This runs on its own every minute; surfacing failures here would turn
 * a flaky network into a stream of notifications. The manual Fetch button
 * (`useActionToolbar.handleFetch`) is the one that reports.
 *
 * It also never touches the undo/redo stacks, unlike the manual fetch: a background refresh that
 * silently cleared the redo stack every minute would eat work the user could still redo.
 *
 * The schedule is timestamp-based rather than a plain `setInterval`, so alt-tabbing in and out
 * doesn't restart the countdown: the elapsed time since the last fetch is carried across focus
 * changes, and coming back to the app after a long absence fetches right away. That timestamp is
 * global, not per-repository — switching tabs therefore fetches the newly active repo on the next
 * tick (within one interval) instead of immediately, which is what keeps tab-hopping from firing a
 * burst of fetches.
 */
export function useAutoFetch() {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const intervalMinutes = useSettingsStore(
    (s) => s.settings.git.autoFetchIntervalMinutes ?? DEFAULT_INTERVAL_MINUTES
  )
  const autoPrune = useSettingsStore((s) => s.settings.git.autoPrune ?? true)
  const focused = useWindowFocus()

  const lastFetchAtRef = useRef(Date.now())
  const inFlightRef = useRef(false)

  // The shared query client is imported directly rather than read through `useQueryClient`: this
  // hook is mounted in `App` ABOVE its own `QueryClientProvider`, where that hook would throw.
  const runFetch = useCallback(async (repo: string, prune: boolean) => {
    // A previous tick still running (a slow remote outlasting the interval) must not stack up
    // another fetch on the same repository.
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      await apiFetchRemote(repo, undefined, prune)
      // A fetch only moves remote refs: the branches' ahead/behind counts and the graph's remote
      // labels. The working tree is untouched, so `git-status` is left alone.
      queryClient.invalidateQueries({ queryKey: ['branches', repo] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repo] })
    } catch {
      // Silent on purpose — see the hook's doc comment.
    } finally {
      lastFetchAtRef.current = Date.now()
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!activeRepo || !focused) return
    const minutes = Math.min(MAX_INTERVAL_MINUTES, Math.max(0, intervalMinutes))
    if (minutes <= 0) return

    const intervalMs = minutes * 60_000
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const schedule = () => {
      const elapsed = Date.now() - lastFetchAtRef.current
      timer = setTimeout(tick, Math.max(0, intervalMs - elapsed))
    }

    const tick = async () => {
      if (cancelled) return
      await runFetch(activeRepo, autoPrune)
      if (!cancelled) schedule()
    }

    schedule()

    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [activeRepo, focused, intervalMinutes, autoPrune, runFetch])
}
