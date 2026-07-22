import { create } from 'zustand'

/**
 * In-memory ring buffer of the most recent Tauri IPC operations, populated by the `invoke` wrapper
 * in `lib/tauri.ts`. Purpose: give the user a readable, exportable trace of exactly what the frontend
 * asked the backend to do (command, arguments, duration, success/error) — surfaced in the "Activity
 * Logs" takeover reached from the footer.
 *
 * Capture is always on: there is no enable/disable switch. The on-screen buffer holds the most recent
 * `MAX_ENTRIES` operations, while every captured entry is also streamed to a rotating on-disk log
 * (one JSONL file per day, pruned after a week) via `lib/activityLogPersistence.ts` — that disk log is
 * the durable copy, so the entries here are never persisted (memory only).
 *
 * Entries carry an optional `correlationId`/`correlationLabel` so several IPC calls belonging to the
 * same user action (a pull, a commit, a rebase…) can be grouped into a single block in the view —
 * see `lib/activityCorrelation.ts`. `repoPath` records which repository an operation targeted, so
 * the view can filter down to the active repository's activity.
 */

export type ActivityLogStatus = 'ok' | 'error'

export interface ActivityLogEntry {
  id: string
  timestamp: number
  command: string
  /** Already redacted/truncated by `redactArgs` before it reaches the store. */
  args?: unknown
  durationMs: number
  status: ActivityLogStatus
  error?: string
  /** Absolute path of the repository this operation targeted, when the command carries one. */
  repoPath?: string
  /** Groups IPC calls issued within the same `runActivity` block (one user action). */
  correlationId?: string
  /** Human-readable label of the correlated user action (e.g. `git.pull`). */
  correlationLabel?: string
}

const MAX_ENTRIES = 1000

let seq = 0

interface ActivityLogState {
  entries: ActivityLogEntry[]
  add: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => void
  clear: () => void
}

export const useActivityLogStore = create<ActivityLogState>((set) => ({
  entries: [],

  // Newest first, capped at MAX_ENTRIES so the buffer can't grow unbounded.
  add: (entry) =>
    set((state) => ({
      entries: [
        { ...entry, id: `${Date.now()}-${seq++}`, timestamp: Date.now() },
        ...state.entries,
      ].slice(0, MAX_ENTRIES),
    })),

  clear: () => set({ entries: [] }),
}))
