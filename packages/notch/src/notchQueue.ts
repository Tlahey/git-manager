/**
 * Which card the notch is showing, and which ones are waiting.
 *
 * There is exactly one notch, and until now a second notification simply *destroyed* the first
 * (the popover window has a fixed label, so creating it again replaced whatever was there). That
 * was survivable while the only source was a GitHub poll every few minutes. It stops being
 * survivable the moment a running hook, a fetch and a merged PR can land in the same second.
 *
 * A pure reducer rather than a store: the desktop app and Storybook drive it from different
 * places, and the interesting behaviour — coalescing, preemption — is exactly the kind of thing
 * that should be assertable without mounting anything.
 */

import { tonePriority } from './notchTones'
import type { NotchModel } from './types'

/**
 * The minimum an entry has to be for the queue to order it: something carrying a model.
 *
 * Generic rather than `NotchModel` itself so a consumer can queue the whole delivery — its route,
 * its icon key, how important it is — without restating the model's `id`/`tone`/`kind` alongside
 * it and then having to keep the two copies in step.
 */
export interface NotchQueueEntry {
  model: NotchModel
}

export interface NotchQueueState<T extends NotchQueueEntry = NotchQueueEntry> {
  /** The card on screen, or `null` when the notch is idle. */
  current: T | null
  /** Waiting cards, highest priority first. */
  pending: T[]
  /**
   * Ids of live cards the user closed, which must not come back while their operation runs.
   *
   * Closing a `progress` card used to last exactly one tick: coalescing by id is what makes the
   * card live, and the very next tick re-enqueued the same id — so a forty-file analysis answered
   * the ✕ by sliding straight back in, animation and all. Suppression is what makes the button mean
   * what it says, and it is held here rather than by each producer because the producers cannot see
   * a dismissal: they go on describing the card they want, correctly, for the whole run.
   *
   * Only `progress` earns it. Any other card carrying a returning id is a genuinely new event — a
   * second failed hook is not the first one refusing to leave.
   */
  suppressed: string[]
}

/** Typed as `never` so it is assignable to a queue of any entry type. */
export const emptyNotchQueue: NotchQueueState<never> = {
  current: null,
  pending: [],
  suppressed: [],
}

function priorityOf(entry: NotchQueueEntry): number {
  return tonePriority(entry.model.tone, entry.model.kind)
}

/**
 * Inserts into a priority-ordered list. `front` puts the entry ahead of its equals instead of
 * behind them — what a card that was already on screen deserves when it gets bumped.
 */
function insertByPriority<T extends NotchQueueEntry>(list: T[], entry: T, front: boolean): T[] {
  const priority = priorityOf(entry)
  const index = list.findIndex((other) =>
    front ? priorityOf(other) <= priority : priorityOf(other) < priority
  )
  if (index === -1) return [...list, entry]
  return [...list.slice(0, index), entry, ...list.slice(index)]
}

function replaceById<T extends NotchQueueEntry>(list: T[], entry: T): T[] | null {
  const index = list.findIndex((other) => other.model.id === entry.model.id)
  if (index === -1) return null
  return [...list.slice(0, index), entry, ...list.slice(index + 1)]
}

/**
 * Whether an arriving card gets to interrupt the one the user is currently reading.
 *
 * Only an error does. Priority decides the *order of the waiting list* — that part is a scheduling
 * question and a live progress card legitimately outranks a merged-PR notice. Taking over the
 * screen is a different question with a different answer: yanking a card out from under someone
 * mid-read is jarring, and almost nothing is urgent enough to justify it. A failed hook or a
 * broken build is; a fetch that just started is not.
 *
 * An error does not preempt another error — the first one is still unread, and they would just
 * trade places.
 */
function preemptsCurrent(incoming: NotchQueueEntry, current: NotchQueueEntry): boolean {
  return incoming.model.tone === 'error' && current.model.tone !== 'error'
}

/**
 * Adds a card, or replaces the one that already carries its id.
 *
 * Coalescing by id is what makes a live card possible: a progress tick re-enqueues the same id and
 * lands as an in-place update, rather than as a 40th queued notification for an operation the user
 * is already watching.
 *
 * A card that {@link preemptsCurrent} takes the notch immediately, and the one it displaced goes
 * back to the head of its priority group rather than being dropped — an error interrupting a
 * running clone must not lose the clone.
 *
 * A card the user has closed is dropped instead, until {@link removeNotch} says its operation is
 * over — see {@link NotchQueueState.suppressed}.
 */
export function enqueueNotch<T extends NotchQueueEntry>(
  state: NotchQueueState<T>,
  entry: T
): NotchQueueState<T> {
  if (state.suppressed.includes(entry.model.id)) return state

  if (state.current?.model.id === entry.model.id) return { ...state, current: entry }

  const coalesced = replaceById(state.pending, entry)
  if (coalesced) return { ...state, pending: coalesced }

  if (!state.current) return { ...state, current: entry }

  if (preemptsCurrent(entry, state.current)) {
    return {
      ...state,
      current: entry,
      pending: insertByPriority(state.pending, state.current, true),
    }
  }

  return { ...state, pending: insertByPriority(state.pending, entry, false) }
}

/** Takes the card on screen off it and promotes the next, saying nothing about why. */
function promoteNext<T extends NotchQueueEntry>(state: NotchQueueState<T>): NotchQueueState<T> {
  const [next, ...rest] = state.pending
  return { ...state, current: next ?? null, pending: rest }
}

/**
 * Retires the card on screen and promotes the next one.
 *
 * This is the *dismissal* path — the ✕, the exit of a card that timed out, a notch window that went
 * away — so a live card retired here is one the user is done with, and it is held out of the queue
 * until its producer retires it too. {@link removeNotch} is the other path, and deliberately does
 * not suppress: it is the producer speaking, not the user.
 */
export function dismissCurrentNotch<T extends NotchQueueEntry>(
  state: NotchQueueState<T>
): NotchQueueState<T> {
  const dismissed = state.current
  const next = promoteNext(state)
  if (dismissed?.model.kind !== 'progress') return next
  if (next.suppressed.includes(dismissed.model.id)) return next
  return { ...next, suppressed: [...next.suppressed, dismissed.model.id] }
}

/**
 * Removes a card wherever it is — on screen or still waiting.
 *
 * The producer's own way of saying the operation is over, which is also what lifts a suppression:
 * the next run of the same operation gets a card again, however the last one ended.
 */
export function removeNotch<T extends NotchQueueEntry>(
  state: NotchQueueState<T>,
  id: string
): NotchQueueState<T> {
  const released = state.suppressed.includes(id)
    ? { ...state, suppressed: state.suppressed.filter((other) => other !== id) }
    : state
  if (released.current?.model.id === id) return promoteNext(released)
  return { ...released, pending: released.pending.filter((entry) => entry.model.id !== id) }
}

/** Every card the queue is holding, on screen first. Handy for a "n more" indicator. */
export function notchQueueSize(state: NotchQueueState<NotchQueueEntry>): number {
  return (state.current ? 1 : 0) + state.pending.length
}
