import { create } from 'zustand'
import type { RemoteOperation, RemoteProgressEvent } from '../lib/tauri'

/**
 * The fetches, pulls and pushes currently in flight, and how the last ones ended.
 *
 * Needed because a transfer is the one kind of work in this app that outlives the user's attention:
 * the command's promise settles when it is over, which on a large clone or a slow link is minutes
 * away, and until now nothing in between existed at all. This is what the notch reads.
 *
 * Keyed by repository *and* operation, because a fetch and a push in the same repository are two
 * separate waits with two separate bars — and several repositories can be transferring at once.
 *
 * Client-side only, never persisted: an operation recorded at quit is not running any more.
 */

export interface RemoteOperationOutcome {
  kind: 'success' | 'error'
  /** Refs the fetch moved — what makes "fetched" worth saying rather than noise. */
  updatedRefs?: string[]
  /** Why it failed, verbatim; the card shows the tail of it. */
  message?: string
}

export interface RemoteOperationEntry {
  repoPath: string
  operation: RemoteOperation
  startedAt: number
  /**
   * Started by a timer rather than by a person.
   *
   * Recorded because the two are worth different amounts of the user's attention, and only the call
   * site can tell them apart. `useAutoFetch` fetches the active repository every minute and again
   * the moment the window regains focus, so a card for its *progress* would mean the notch lighting
   * up every time the user alt-tabs back — for a transfer they never asked for and that is usually
   * over in under a second. What it *found* is still worth saying; the wait itself is not.
   */
  background: boolean
  /** `null` until the first report — a transfer negotiating with the server has no counts yet. */
  progress: Omit<RemoteProgressEvent, 'repoPath' | 'operation'> | null
  /** `null` while it is still running. */
  outcome: RemoteOperationOutcome | null
}

export function remoteOperationKey(repoPath: string, operation: RemoteOperation): string {
  return `${operation}:${repoPath}`
}

interface RemoteProgressState {
  operations: Record<string, RemoteOperationEntry>
  start: (repoPath: string, operation: RemoteOperation, background?: boolean) => void
  report: (event: RemoteProgressEvent) => void
  finish: (repoPath: string, operation: RemoteOperation, outcome: RemoteOperationOutcome) => void
  clear: (key: string) => void
}

export const useRemoteProgressStore = create<RemoteProgressState>((set) => ({
  operations: {},

  start: (repoPath, operation, background = false) =>
    set((state) => ({
      operations: {
        ...state.operations,
        [remoteOperationKey(repoPath, operation)]: {
          repoPath,
          operation,
          startedAt: Date.now(),
          background,
          progress: null,
          outcome: null,
        },
      },
    })),

  report: ({ repoPath, operation, ...progress }) =>
    set((state) => {
      const key = remoteOperationKey(repoPath, operation)
      const entry = state.operations[key]
      // A report for an operation this window never started — another window's transfer, or one
      // whose `finish` already landed. Dropped rather than resurrecting an entry with no owner.
      if (!entry || entry.outcome) return state
      return { operations: { ...state.operations, [key]: { ...entry, progress } } }
    }),

  finish: (repoPath, operation, outcome) =>
    set((state) => {
      const key = remoteOperationKey(repoPath, operation)
      const entry = state.operations[key]
      if (!entry) return state
      return { operations: { ...state.operations, [key]: { ...entry, outcome } } }
    }),

  clear: (key) =>
    set((state) => {
      if (!(key in state.operations)) return state
      const operations = { ...state.operations }
      delete operations[key]
      return { operations }
    }),
}))
