import { useEffect, useMemo, useRef } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'
import type { NotchModel } from '@git-manager/notch'
import { apiOnNotchDismissed } from '../api/notification.api'
import { registerNotchAction } from '../lib/notifications/notchActions'
import type { NotchImportance } from '../lib/notifications/notchDelivery'
import type { NotificationRoute } from '../lib/notifications/notificationRoute'
import { useNotchQueueStore } from '../stores/notchQueue.store'

/**
 * Puts a long-running operation on the notch, and takes it off again.
 *
 * The generic bridge between "something is happening in this component" and the notch queue. A
 * caller describes the card it wants *right now*; this keeps the queue in step — enqueue when one
 * appears, update in place while it changes, remove when it goes. Nothing here knows about commit
 * searches, clones or hooks, which is the point: the next three features that want a live card
 * reuse this rather than each re-deriving the same four effects.
 *
 * Three things it deliberately owns, because every caller would otherwise get them wrong:
 *
 * - **The card is removed on unmount.** An operation whose owner has gone must not leave a card
 *   pinned to the top of the screen with nothing behind it.
 * - **Actions are scoped to this card.** A handler registered here only fires for its own
 *   `notchId`, so two repositories running the same kind of operation can't cancel each other.
 * - **A card the user closed stays closed.** See {@link NotchOperationOptions.runId} — the enqueue
 *   below re-runs on every progress tick, so without a latch the ✕ would be undone within a frame.
 */
export interface NotchOperationOptions {
  /**
   * Stable identity for the card, and the operation's single id.
   *
   * It is **stamped onto the model** rather than merely expected to match it. Three things key off
   * it — where the queue coalesces, which card is removed when the operation ends, and which
   * presses an action handler answers — and a caller whose `model.id` drifted from this one would
   * get a card that updates but is never removed, and buttons that silently do nothing. Making it
   * structural is what stops that being possible.
   */
  id: string
  /** The card to show, or `null` for "nothing to show right now". Its own `id` is overwritten. */
  model: NotchModel | null
  /**
   * Which *run* of this operation the card is about — the boundary a user's dismissal is latched
   * against, and the only reason this option exists.
   *
   * A card that never times out (`progress`) can only leave by the user's hand, and that dismissal
   * has to stick: the enqueue effect re-runs on every tick of the model, so the card the user just
   * closed would otherwise be back on screen before their pointer had moved. The latch is what
   * stops that — and it then needs a boundary, or a producer whose id is stable would be silenced
   * for the rest of the session by one ✕.
   *
   * **The default boundary is the model going away** (`null`, or `enabled: false`): nothing to show
   * *is* the end of what was being shown, so the next card under this id is a new thing and the
   * latch lifts. That covers every producer whose card comes and goes with its operation —
   * `NotchAiRuns`, the transfers, the hooks.
   *
   * It does **not** cover a producer whose model is continuous across runs, which is what this
   * option is for. The AI commit search is one: its id is per *repository*, and a second search
   * takes the phase straight from `done` to `scanning` with no `null` in between, so its two runs
   * are indistinguishable from one long one. Nothing in the model tells them apart either — a
   * repeated question is the same card, byte for byte. Only the caller knows a new run started, so
   * the caller says so.
   *
   * Every way a card leaves emits the same dismissal, and that is deliberate for the ways the user
   * chose one: the ✕, a click through to the app, an action button. A `status` card's auto-dismiss
   * timer emits it too, which is harmless — a `status` card is already an operation's last word.
   */
  runId?: string
  /**
   * Gate on showing it at all, for callers with a reason to suppress the card entirely — a setting
   * switched off, an operation nobody asked for.
   *
   * **Never window focus.** Three producers have reached for it and all three had it taken back
   * out: auto-fetch paused while unfocused, when unattended is precisely when a background fetch
   * earns its keep; `NotchAiRuns` showed only while unfocused, to avoid duplicating the footer's
   * busy pill, which is easy to miss unless you were already looking at it; and the commit search
   * gated on it until the card left every time the user came back to the app and returned the
   * moment they switched away. The reasoning is the same each time and worth stating once: a card
   * is about work the user started, it costs nothing to ignore, and it has its own ✕ — so *they*
   * decide when it goes, not which window happens to be in front. The hook that read the flag
   * (`useWindowFocus`) was deleted along with its last caller; reintroducing it here means
   * reintroducing this bug for a fourth time.
   */
  enabled?: boolean
  /**
   * Defaults to `ambient`: a running operation is worth a surface that costs nothing to ignore,
   * and is not worth a permanent entry in Notification Centre. Pass `key` for the rare card that
   * deserves a banner when the notch isn't available.
   */
  importance?: NotchImportance
  /**
   * Where clicking the card takes the user.
   *
   * Unlike {@link NotchOperationOptions.actions}, this is handled in the *main* window rather than
   * here: the card's `activate` travels as the same event an OS banner's click produces, so it goes
   * through `routeNotification` like every other surface. A card about work the user started
   * somewhere should be able to take them back to it.
   */
  route?: NotificationRoute
  /** `actionId` → what to do when that button is pressed on *this* card. */
  actions?: Record<string, () => void>
}

/**
 * Joins the action ids into one effect dependency.
 *
 * A NUL, because it cannot occur in an id, so no set of ids can collide with another by
 * being joined. Written as an escape and not as a literal NUL byte, which is what it was:
 * that made git treat this whole file as binary, so every diff of it came back as
 * `Bin 5575 -> 9575 bytes` and nobody could review a change to it.
 */
const ACTION_ID_SEPARATOR = '\0'

export function useNotchOperation({
  id,
  model,
  runId,
  enabled = true,
  importance = 'ambient',
  route,
  actions,
}: NotchOperationOptions): void {
  const enqueue = useNotchQueueStore((s) => s.enqueue)
  const remove = useNotchQueueStore((s) => s.remove)

  // The card as it will actually be queued: whatever the caller described, under this hook's id.
  const stamped: NotchModel | null = model ? { ...model, id } : null

  // Read through refs so a caller that rebuilds its handlers (or its model) every render doesn't
  // re-register listeners or re-emit an update that changed nothing.
  const latestActions = useRef(actions)
  latestActions.current = actions
  const latestModel = useRef(stamped)
  latestModel.current = stamped
  const latestRoute = useRef(route)
  latestRoute.current = route

  /**
   * The user has closed this card, and it is not to come back for this run.
   *
   * A ref rather than state on purpose: it must not re-render the caller, and the enqueue effect
   * below reads it at the moment it would push rather than at the moment it was scheduled.
   */
  const dismissedRef = useRef(false)

  // The latch's boundary — see `runId`. Declared before the enqueue effect so that on the render
  // where a new run starts, the reset has already happened by the time the card would be pushed.
  useEffect(() => {
    dismissedRef.current = false
  }, [id, runId])

  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let cancelled = false

    apiOnNotchDismissed(({ notchId }) => {
      // Events reach every webview and the queue coalesces on id: anything else is somebody else's
      // card, and latching on it would silence an operation the user never touched.
      if (notchId !== id) return
      dismissedRef.current = true
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
  }, [id])

  // Registrations are keyed on the *set* of ids, not the handler identities.
  const actionIds = useMemo(() => Object.keys(actions ?? {}).sort(), [actions])
  const actionKey = actionIds.join(ACTION_ID_SEPARATOR)

  useEffect(() => {
    const unregisters = (actionKey ? actionKey.split(ACTION_ID_SEPARATOR) : []).map((actionId) =>
      registerNotchAction(actionId, ({ notchId }) => {
        if (notchId !== id) return
        latestActions.current?.[actionId]?.()
      })
    )
    return () => {
      for (const unregister of unregisters) unregister()
    }
  }, [actionKey, id])

  /**
   * The card's content, as a value that only changes when the card really does.
   *
   * A model is rebuilt on every render, so using it directly as an effect dependency would push a
   * `notch://update` at the window on every keystroke elsewhere in the app. Serialising is honest
   * here: the model is small and serializable by contract — it has to survive a URL.
   */
  const modelKey = stamped ? JSON.stringify(stamped) : null
  // Same reasoning as `modelKey`: a route is rebuilt every render, and comparing it by identity
  // would re-enqueue the card on every keystroke elsewhere in the app.
  const routeKey = route ? JSON.stringify(route) : null

  useEffect(() => {
    const current = latestModel.current
    if (!enabled || !current) {
      // The default boundary for the dismissal latch: nothing left to show is the end of what was
      // being shown, so whatever appears under this id next is a new thing. See `runId`.
      dismissedRef.current = false
      remove(id)
      return
    }
    // The user closed this card. Everything after it is the same run still ticking — including its
    // outcome, which is the last thing they asked not to see any more of.
    if (dismissedRef.current) return
    const route = latestRoute.current
    enqueue({ model: current, importance, ...(route ? { route } : {}) })
  }, [modelKey, routeKey, enabled, id, runId, importance, enqueue, remove])

  useEffect(() => {
    return () => remove(id)
  }, [id, remove])
}
