import { create } from 'zustand'
import {
  dismissCurrentNotch,
  emptyNotchQueue,
  enqueueNotch,
  removeNotch,
  type NotchQueueState,
} from '@git-manager/notch'
import type { NotchRequest } from '../lib/notifications/notchDelivery'

/**
 * The notch's waiting list, held in the main window.
 *
 * It has to live here rather than in the notch window for a structural reason: the notch window is
 * *transient*. It is created per card and destroyed with it, so a queue kept inside it would be
 * thrown away every time a card was dismissed — which is exactly when the next one needs to be
 * promoted. The main window is the only thing that outlives the cards.
 *
 * Deliberately **not** persisted. A notification queued when the app quit is stale by the time it
 * comes back, and replaying yesterday's "checks failed" at launch would be worse than silence.
 * All the reducing is the package's; this only holds the state and re-exposes it to React.
 */
interface NotchQueueStore {
  queue: NotchQueueState<NotchRequest>
  /** Adds a card, or coalesces onto one already carrying its id. */
  enqueue: (request: NotchRequest) => void
  /** Retires the card on screen and promotes the next. */
  dismissCurrent: () => void
  /** Drops one card wherever it is — the producer of a cancelled operation calls this. */
  remove: (notchId: string) => void
  clear: () => void
}

export const useNotchQueueStore = create<NotchQueueStore>()((set) => ({
  queue: emptyNotchQueue,
  enqueue: (request) => set((state) => ({ queue: enqueueNotch(state.queue, request) })),
  dismissCurrent: () => set((state) => ({ queue: dismissCurrentNotch(state.queue) })),
  remove: (notchId) => set((state) => ({ queue: removeNotch(state.queue, notchId) })),
  clear: () => set({ queue: emptyNotchQueue }),
}))
