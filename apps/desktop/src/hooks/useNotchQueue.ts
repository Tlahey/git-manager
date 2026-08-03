import { useEffect, useRef } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'
import {
  apiEmitNotchUpdate,
  apiOnNotchDismissed,
  apiSendNativeNotification,
} from '../api/notification.api'
import { closeNotchWindow, openNotchWindow } from '../lib/notifications/notchWindow'
import {
  nativeSpecFor,
  resolveNotchFallbackSurface,
  resolveNotificationSurface,
  type NotificationSurface,
} from '../lib/notifications/notchDelivery'
import { useNotchQueueStore } from '../stores/notchQueue.store'
import { useSettingsStore } from '../stores/settings.store'

/**
 * Keeps the notch window showing whatever the queue says is current.
 *
 * The queue is state; this is the one thing that turns it into a window. Mounted once by `App`,
 * next to `useNotificationWatcher`.
 *
 * The protocol with the window is deliberately small and id-guarded, because events broadcast to
 * every webview and a card that has already been replaced can still have one in flight:
 *
 * - `current` becomes a *different* card → open a window for it (which closes the previous one).
 * - `current` keeps its id and changes content → push it in place, so a progress tick doesn't tear
 *   the card down and replay its entrance animation forty times.
 * - `current` becomes `null` → close the window.
 * - the window reports it dismissed itself → retire that card and promote the next.
 */
export function useNotchQueue() {
  const current = useNotchQueueStore((s) => s.queue.current)
  const dismissCurrent = useNotchQueueStore((s) => s.dismissCurrent)

  // The card the window is actually showing, which is not the same thing as `current`: opening is
  // async, and this is what tells "a new card arrived" apart from "the same card changed".
  const shownIdRef = useRef<string | null>(null)

  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let cancelled = false

    apiOnNotchDismissed(({ notchId }) => {
      // Read the store rather than closing over `current`: this listener is bound once, and a
      // dismissal that names a card the queue has already moved past must be ignored, not applied
      // to whatever took its place.
      if (useNotchQueueStore.getState().queue.current?.model.id !== notchId) return
      dismissCurrent()
    })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch((e) => console.warn('Failed to bind the notch dismissal listener:', e))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [dismissCurrent])

  useEffect(() => {
    if (!current) {
      if (shownIdRef.current !== null) {
        shownIdRef.current = null
        void closeNotchWindow()
      }
      return
    }

    if (shownIdRef.current === current.model.id) {
      void apiEmitNotchUpdate({ model: current.model })
      return
    }

    shownIdRef.current = current.model.id
    const request = current

    /** Retires a card that will never be on screen, so the queue doesn't stall on it. */
    const moveOn = () => {
      if (useNotchQueueStore.getState().queue.current?.model.id !== request.model.id) return
      shownIdRef.current = null
      dismissCurrent()
    }

    void (async () => {
      // The surface decision lives here, and only here, because this is the one point every card
      // passes through whoever produced it. It used to live in `notifyUser`, which only the GitHub
      // notifications go through — so a transfer or a search card opened a notch window even for a
      // user who had explicitly asked for macOS banners.
      const settings = useSettingsStore.getState().settings.notifications
      // e2e-only escape hatch, dead-code-eliminated from every real build: the git-hooks suite
      // asserts on cards *reaching this queue* (a subscription installed from the test side), and
      // needs producers enabled for that — but showing the cards from a test run is all cost: a
      // real second WebviewWindow the WebKit driver handles badly, and, when that window cannot
      // open, a REAL macOS banner via the native fallback (measured: test runs spamming the
      // host's Notification Centre with "the pre-commit hook stopped the operation"). Forcing the
      // surface downstream of the enqueue keeps the whole production chain real except the final
      // paint. Set by the suite's recording step; cleared by its per-scenario baseline.
      const forcedSurface =
        import.meta.env.VITE_E2E === 'true'
          ? (window as unknown as { __e2eNotificationSurface?: NotificationSurface })
              .__e2eNotificationSurface
          : undefined
      const surface = forcedSurface ?? resolveNotificationSurface(request, settings)

      if (surface === 'none') {
        moveOn()
        return
      }

      if (surface === 'native') {
        await apiSendNativeNotification(nativeSpecFor(request))
        moveOn()
        return
      }

      let opened = false
      try {
        // `moveOn` doubles as the backstop for a window that goes away without saying so. The card
        // normally announces its own dismissal on its way out, and that is what promotes the next
        // one — but that announcement leaves a webview which is about to be destroyed, so it is not
        // something to stake the whole queue on. Losing it once used to be permanent: the app went
        // on believing a card was up, and every notification after it waited behind a window that
        // no longer existed. `moveOn` matches on the card's id, so arriving after the normal path
        // has already run is a no-op.
        opened = await openNotchWindow(request, { onDestroyed: moveOn })
      } catch (e) {
        console.warn('Notch window failed to open:', e)
      }
      if (opened) return

      // Nothing is going to dismiss a card that never appeared.
      if (resolveNotchFallbackSurface(request) === 'native') {
        await apiSendNativeNotification(nativeSpecFor(request))
      }
      moveOn()
    })()
  }, [current, dismissCurrent])

  // Leave no orphan window behind if the app tears the main window down while a card is up.
  //
  // The unmount half only covers an orderly teardown. A *reload* of the main window runs no React
  // cleanup at all, and the notch is a separate OS window that survives it — so a card that was up
  // at that moment stays on screen forever, owned by nobody: the fresh mount starts with an empty
  // queue and a null `shownIdRef`, so the effect above never recognises it as something to close.
  // Closing whatever is there on mount is the only thing that can reclaim it, and it is always
  // safe: a card is only ever legitimate while the window that produced it is alive.
  useEffect(() => {
    void closeNotchWindow()
    return () => {
      if (shownIdRef.current !== null) void closeNotchWindow()
    }
  }, [])
}
