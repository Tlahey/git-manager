import { useEffect } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { apiOnHookProgress } from '../api/hookProgress.api'
import { useHookProgressStore } from '../stores/hookProgress.store'

/**
 * Feeds running-hook events from Rust into the store.
 *
 * Bound once for the app's lifetime and unconditionally, for the same reason as
 * `useRemoteProgressListener`: the store is where any consumer reads a hook's state from, and
 * gating the feed on a notification setting would make "no hook is running" and "you turned cards
 * off" the same thing.
 */
export function useHookProgressListener() {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let cancelled = false

    apiOnHookProgress((event) => useHookProgressStore.getState().report(event))
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch((e) => console.warn('Failed to bind the hook progress listener:', e))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
