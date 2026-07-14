import { useEffect } from 'react'
import { useUpdaterStore } from '../stores/updater.store'

/**
 * Fired once from `App.tsx` on launch: loads the running version and silently checks the
 * updater endpoint, so an available update is already reflected in the footer badge and
 * Settings → General without the user having to open Settings and click "check" first.
 */
export function useAppUpdateCheck() {
  useEffect(() => {
    const store = useUpdaterStore.getState()
    store.loadCurrentVersion()
    store.checkForUpdate({ silent: true })
  }, [])
}
