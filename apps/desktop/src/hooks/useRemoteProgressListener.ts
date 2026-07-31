import { useEffect } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { apiOnRemoteProgress } from '../api/remoteProgress.api'
import { useRemoteProgressStore } from '../stores/remoteProgress.store'

/**
 * Feeds transfer progress from Rust into the store.
 *
 * Bound once for the app's lifetime, unconditionally — including with notifications switched off.
 * The store is where *any* consumer reads a transfer's state from, not just the notch, and gating
 * the feed on a notification setting would make the two indistinguishable.
 */
export function useRemoteProgressListener() {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let cancelled = false

    apiOnRemoteProgress((event) => useRemoteProgressStore.getState().report(event))
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch((e) => console.warn('Failed to bind the remote progress listener:', e))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
