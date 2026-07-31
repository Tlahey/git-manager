import { useEffect } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { apiOnNotchAction } from '../api/notification.api'
import { runNotchAction } from '../lib/notifications/notchActions'

/**
 * Receives the notch actions its own window couldn't perform, and hands them to whoever registered
 * for them.
 *
 * Mounted once by `App`, unconditionally. It stays bound even with notifications switched off: a
 * card can still be on screen from before the setting changed, and a button press must not fall
 * into a hole.
 *
 * An action nobody claimed is logged rather than swallowed. That is the whole reason this is worth
 * having as its own hook: without it, a producer that ships a button and forgets to register its
 * handler gets a card whose button does nothing, silently, and looks like a rendering bug.
 */
export function useNotchActionListener() {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let cancelled = false

    apiOnNotchAction(({ actionId, notchId }) => {
      if (runNotchAction(actionId, { notchId })) return
      console.warn(
        `Notch action "${actionId}" (card "${notchId}") has no handler — ` +
          'register one with registerNotchAction where the card is raised.'
      )
    })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch((e) => console.warn('Failed to bind the notch action listener:', e))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
