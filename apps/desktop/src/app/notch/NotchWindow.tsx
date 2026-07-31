import { useEffect, useMemo, useState } from 'react'
import { emit } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useTranslation } from '@git-manager/i18n'
import {
  HALO_MARGIN,
  measureCardHeight,
  NOTCH_CARD_WIDTH,
  NotchNotification,
  useNotchPresenter,
} from '@git-manager/notch'
import { useSettingsStore } from '../../stores/settings.store'
import {
  apiEmitNotchAction,
  apiEmitNotchDismissed,
  apiOnNotchUpdate,
  NOTIFICATION_ACTIVATED_EVENT,
} from '../../api/notification.api'
import { resolveDisplayDurationMs } from '../../lib/notifications/notificationDisplay'
import { createTauriNotchHost, resizeNotchWindow } from '../../lib/notifications/tauriNotchHost'
import { openUrl } from '../../lib/openUrl'
import { getNotificationIcon } from '../../components/notification/utils'
import type { NotchPayload } from '../../lib/notifications/notchWindow'

/**
 * The notch card's own window.
 *
 * Thin by design: the layout, the geometry and the enter/exit sequence all live in
 * `@git-manager/notch`, and what is left here is what is genuinely this app's — which window the
 * card lives in, what its two built-in actions do, how long the user asked it to stay, and the
 * two events that keep it in step with the queue running in the main window.
 */
export function NotchWindow({
  model: initialModel,
  iconId,
  route,
  externalUrl,
  windowX,
  windowY,
  bandHeight,
  housingHalfWidth,
}: NotchPayload) {
  const { t } = useTranslation('common')

  // The card can be replaced in place while it is up — that is what makes a progress card tick
  // without its entrance animation restarting on every frame. The initial model comes from the
  // window's URL; `notch://update` supplies every one after that.
  const [model, setModel] = useState(initialModel)

  // This window is a separate webview with its own store instance, but `settings.store` persists
  // to localStorage, which the two windows share — so what it reads here is the same snapshot the
  // Settings page wrote. Read once: a card lives for a few seconds, and re-reading it mid-life
  // would let a settings change restart the countdown under the user.
  const notifications = useMemo(() => useSettingsStore.getState().settings.notifications, [])

  const host = useMemo(
    () =>
      createTauriNotchHost({
        windowX,
        withSound: notifications?.enableSound ?? false,
      }),
    [windowX, notifications]
  )

  const presenter = useNotchPresenter({
    host,
    restY: windowY,
    // A live card has no business timing out: a clone at 40 % that vanishes after five seconds
    // has told the user nothing and taken away the only thing tracking the operation. It ends when
    // its producer says so — by replacing it with a `status` card, or by clearing the queue.
    // `null` is also what "until I close it" means for the other kinds; the presenter arms no
    // timer at all rather than a very long one.
    autoDismissMs: model.kind === 'progress' ? null : resolveDisplayDurationMs(notifications),
    // Dismiss like a native NSPopover the moment focus leaves it — a click anywhere else on
    // screen, not just on the main window.
    dismissOnBlur: model.kind !== 'progress',
    // Returned, not fired and forgotten: the presenter awaits this before closing the window, and
    // closing the window destroys the webview this emit travels out of.
    onDismissed: () => apiEmitNotchDismissed({ notchId: model.id }),
  })

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    apiOnNotchUpdate(({ model: next }) => {
      // Events reach every webview, and the queue coalesces on id — anything else is a card this
      // window is not showing.
      if (next.id !== initialModel.id) return
      setModel(next)
    })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch((e) => console.warn('Failed to bind the notch update listener:', e))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [initialModel.id])

  // A replacement card can be a different height — a progress card that ends as a failure grows an
  // output block — and a window still sized for the old one would clip it.
  useEffect(() => {
    void resizeNotchWindow(
      NOTCH_CARD_WIDTH + HALO_MARGIN * 2,
      measureCardHeight(model, bandHeight) + HALO_MARGIN * 2
    )
  }, [model, bandHeight])

  /**
   * Brings the app forward, and — when the card knows where it belongs — navigates there.
   *
   * The route is emitted as the exact same event the OS banner's click already produces, so the
   * main window's existing `useNotificationWatcher` listener handles it: this window's Zustand
   * stores are a separate instance and navigating from here would mutate state nobody reads.
   *
   * Surfacing the window is unconditional, and that is not incidental. A card with no route is
   * still about something the user left running in the app — a finished search, a dev server that
   * came up — and "bring me back to it" is the only thing clicking it could reasonably mean.
   */
  async function activate() {
    if (route) await emit(NOTIFICATION_ACTIVATED_EVENT, route)
    const main = await WebviewWindow.getByLabel('main')
    await main?.show()
    await main?.setFocus()
    presenter.dismiss()
  }

  async function handleAction(actionId: string) {
    if (actionId === 'activate') {
      await activate()
      return
    }
    if (actionId === 'open-external') {
      if (externalUrl) await openUrl(externalUrl)
      presenter.dismiss()
      return
    }
    // Anything a future producer defines (a hook's "Show output", a task's "Restart"): hand it to
    // the main window, which is the one with the stores and the router. Keeping this open-ended is
    // what stops every new kind of card from having to edit this file. The card's id travels with
    // it so a handler can tell which operation it belongs to.
    await apiEmitNotchAction({ actionId, notchId: model.id })
    presenter.dismiss()
  }

  return (
    <div className="h-screen w-screen">
      <NotchNotification
        model={model}
        visible={presenter.visible}
        {...(iconId ? { icon: getNotificationIcon(iconId) } : {})}
        // "Git Manager" is the product name — a proper noun, deliberately untranslated.
        productName="Git Manager"
        closeLabel={t('actions.close')}
        onAction={(actionId) => void handleAction(actionId)}
        onActivate={() => void activate()}
        onDismiss={presenter.dismiss}
        onPointerEnter={presenter.pauseAutoDismiss}
        onPointerLeave={presenter.resumeAutoDismiss}
        {...(bandHeight !== undefined ? { bandHeight } : {})}
        {...(housingHalfWidth !== undefined ? { housingHalfWidth } : {})}
      />
    </div>
  )
}
