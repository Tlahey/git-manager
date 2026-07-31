/**
 * Handlers for the notch actions the card's own window cannot perform.
 *
 * The window knows how to do exactly two things on its own — follow the card's route
 * (`activate`) and open its URL (`open-external`) — because those need nothing but the payload it
 * was created with. Everything else a producer puts on a card ("Show output" on a failed hook,
 * "Restart" on a dead dev server, "Cancel" on a running clone) needs the stores, the router or the
 * process that raised it, all of which live in the main window.
 *
 * A registry rather than a `switch` in the listener for one reason: the producer of a card and the
 * handler for its buttons should be the same piece of code. A hook feature registers `retry` next
 * to where it raises the card, and nothing about the notch pipeline has to learn that hooks exist.
 *
 * Registration is process-wide and lasts as long as the feature that owns it, so handlers are
 * expected to be idempotent and to tolerate being called for a card that has already gone.
 */

export interface NotchActionContext {
  /** The `model.id` of the card the button was on — a producer's handle on its own operation. */
  notchId: string
}

export type NotchActionHandler = (context: NotchActionContext) => void

const handlers = new Map<string, NotchActionHandler>()

/**
 * Registers the handler for one action id, returning the function that removes it.
 *
 * Deliberately last-write-wins with a warning rather than a silent overwrite or a throw: two
 * features claiming the same id is a mistake worth seeing, but not one worth crashing over in a
 * notification pipeline.
 */
export function registerNotchAction(actionId: string, handler: NotchActionHandler): () => void {
  if (handlers.has(actionId)) {
    console.warn(`Notch action "${actionId}" was already registered; the new handler replaces it.`)
  }
  handlers.set(actionId, handler)
  return () => {
    if (handlers.get(actionId) === handler) handlers.delete(actionId)
  }
}

/**
 * Runs the handler for an action, reporting whether anyone was listening.
 *
 * `false` is the interesting case: a card offered the user a button and pressing it did nothing.
 * Returning it (rather than failing silently) is what lets the listener say so out loud.
 */
export function runNotchAction(actionId: string, context: NotchActionContext): boolean {
  const handler = handlers.get(actionId)
  if (!handler) return false
  try {
    handler(context)
  } catch (e) {
    console.error(`Notch action "${actionId}" threw:`, e)
  }
  return true
}

/** Test seam — drops every registration. */
export function clearNotchActions(): void {
  handlers.clear()
}
