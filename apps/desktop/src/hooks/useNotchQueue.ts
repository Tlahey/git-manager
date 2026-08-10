import { useEffect, useRef } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'
import {
  apiEmitNotchUpdate,
  apiOnNotchDismissed,
  apiSendNativeNotification,
} from '../api/notification.api'
import {
  closeNotchWindow,
  openNotchWindow,
  warmUpNotchWindow,
} from '../lib/notifications/notchWindow'
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
 * - `current` becomes a *different* card → point the notch window at it (which replaces whatever it
 *   was showing).
 * - `current` keeps its id and changes content → push it in place, so a progress tick doesn't tear
 *   the card down and replay its entrance animation forty times.
 * - `current` becomes `null` → park the window, empty and hidden.
 * - the window reports it dismissed itself → retire that card and promote the next.
 *
 * "Park" rather than "close" throughout, and the window is created here at mount rather than by the
 * first card: creating a webview activates the whole application on macOS, so the one window is
 * made once, at launch, while the app is frontmost anyway. See `notchWindow.ts`'s header.
 */
export function useNotchQueue() {
  const current = useNotchQueueStore((s) => s.queue.current)
  const dismissCurrent = useNotchQueueStore((s) => s.dismissCurrent)

  // The card the window is actually showing, which is not the same thing as `current`: opening is
  // async, and this is what tells "a new card arrived" apart from "the same card changed".
  const shownIdRef = useRef<string | null>(null)
  // Which *opening* is the live one. Not the same question as which card is current: the same card
  // id can be shown, dropped and shown again within a few hundred milliseconds, and the first
  // window's death notice arrives after the second window is already up. Matching on the id alone
  // let that stale notice retire the card that had replaced it — the queue then went quiet with a
  // window on screen nobody owned, which is one of the two ways a live search ended up showing no
  // card at all.
  const openSeqRef = useRef(0)

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
    const seq = ++openSeqRef.current

    /** Retires a card that will never be on screen, so the queue doesn't stall on it. */
    const moveOn = () => {
      // The sequence check first, and it is the one that matters: this fires from a window's death
      // notice, which can arrive long after that window was superseded. Without it a dead window
      // retires the card its replacement is currently showing.
      if (openSeqRef.current !== seq) return
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

  // Leave no orphan card behind if the app tears the main window down while one is up.
  //
  // The unmount half only covers an orderly teardown. A *reload* of the main window runs no React
  // cleanup at all, and the notch is a separate OS window that survives it — so a card that was up
  // at that moment stays on screen forever, owned by nobody: the fresh mount starts with an empty
  // queue and a null `shownIdRef`, so the effect above never recognises it as something to take
  // down. Parking whatever is there on mount is the only thing that can reclaim it, and it is
  // always safe: a card is only ever legitimate while the window that produced it is alive.
  //
  // The same mount is also where the notch window is *created*, once, and this is the reason it
  // happens here rather than lazily on the first card: creating a webview activates the whole
  // application on macOS, and at launch the app is frontmost anyway, so this is the one moment
  // that costs the user nothing. See `notchWindow.ts`'s header.
  useEffect(() => {
    void (async () => {
      await closeNotchWindow()
      // Not in the e2e suite, whose driver handles a second WebviewWindow badly enough that one
      // permanently present would break scenarios that never go near a notification. Cards there
      // fall back to opening their own window, exactly as they did before — and the suite already
      // forces most of them to a surface of its choosing anyway (see the `forcedSurface` hatch
      // above). Dead-code-eliminated from every real build.
      if (import.meta.env.VITE_E2E === 'true') return
      await warmUpNotchWindow()
    })()
    return () => {
      if (shownIdRef.current !== null) void closeNotchWindow()
    }
  }, [])
}
