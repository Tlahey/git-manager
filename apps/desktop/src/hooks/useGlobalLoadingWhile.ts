import { useEffect } from 'react'
import { useGlobalLoadingStore } from '../stores/globalLoading.store'

/**
 * Show the global {@link LoadingOverlay} while `active` is true, tearing it down
 * on `false` or unmount. `label` is captured as the overlay caption for the
 * duration of the operation.
 *
 * Typical use: `useGlobalLoadingWhile(query.isLoading, t('...'))` to surface a
 * repo's initial load (e.g. when switching to an uncached repo).
 */
export function useGlobalLoadingWhile(active: boolean, label?: string): void {
  useEffect(() => {
    if (!active) return
    const token = useGlobalLoadingStore.getState().begin(label)
    return () => useGlobalLoadingStore.getState().end(token)
  }, [active, label])
}
