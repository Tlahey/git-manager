import { useCallback, useEffect, useRef } from 'react'
import { queryClient } from '../lib/queryClient'
import { apiFetchRemote } from '../api/git.api'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useSettingsStore } from '../stores/settings.store'

/** Matches the store default and the Settings input's ceiling (`GeneralSection`). */
const DEFAULT_INTERVAL_MINUTES = 1
const MAX_INTERVAL_MINUTES = 60

/**
 * Background `git fetch` of the ACTIVE repository, every `settings.git.autoFetchIntervalMinutes`
 * minutes (0 disables it) — including while the app window doesn't have focus.
 *
 * That is the point of running it at all: the notch is what makes an unattended repository worth
 * keeping current, by surfacing what changed without anyone having to be looking. Pausing the
 * moment the window lost focus (an earlier version of this hook did) would defeat that — the one
 * time a background fetch is most useful is exactly when nobody is watching it happen.
 *
 * Deliberately silent about *how* it went: no toast on success, and a scheduled fetch's own
 * *failure* (offline, missing credentials, a remote that's gone) is swallowed rather than raised on
 * the notch — see `background` below and its gate in `NotchRemoteOperations.tsx`. A long-unattended
 * window with a flaky connection must not turn into a stream of error cards for a transfer nobody
 * asked for; the manual Fetch button is what reports its own failures. What a background fetch
 * *found* (branches that moved) still reaches the notch — that is the whole reason for running it
 * unattended in the first place.
 *
 * It also never touches the undo/redo stacks, unlike the manual fetch: a background refresh that
 * silently cleared the redo stack every minute would eat work the user could still redo.
 *
 * The schedule is timestamp-based rather than a plain `setInterval`, so a re-render that changes an
 * unrelated dependency (switching the active repository, say) doesn't restart the countdown: the
 * elapsed time since the last fetch carries over, and the newly active repo is picked up on the next
 * tick (within one interval) instead of immediately — which is what keeps tab-hopping from firing a
 * burst of fetches.
 */
export function useAutoFetch() {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const intervalMinutes = useSettingsStore(
    (s) => s.settings.git.autoFetchIntervalMinutes ?? DEFAULT_INTERVAL_MINUTES
  )
  const autoPrune = useSettingsStore((s) => s.settings.git.autoPrune ?? true)

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
      await apiFetchRemote(repo, undefined, prune, { background: true })
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
    if (!activeRepo) return
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
  }, [activeRepo, intervalMinutes, autoPrune, runFetch])
}
