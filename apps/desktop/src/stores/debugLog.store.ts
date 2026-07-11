import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * In-memory ring buffer of the most recent Tauri IPC operations, populated by the `invoke`
 * wrapper in `lib/tauri.ts` when logging is enabled. Purpose: give the user a copy/exportable
 * trace of exactly what the frontend asked the backend to do (command, arguments, duration,
 * success/error) when reproducing a bug — the app is otherwise a black box from the outside.
 *
 * `enabled` is persisted (an explicit opt-in that survives restarts); the entries themselves are
 * never persisted — they stay in memory only, both for privacy and because they're ephemeral.
 */

export type DebugLogStatus = 'ok' | 'error'

export interface DebugLogEntry {
  id: string
  timestamp: number
  command: string
  /** Already redacted/truncated by `redactArgs` before it reaches the store. */
  args?: unknown
  durationMs: number
  status: DebugLogStatus
  error?: string
}

const MAX_ENTRIES = 200

let seq = 0

interface DebugLogState {
  enabled: boolean
  entries: DebugLogEntry[]
  setEnabled: (enabled: boolean) => void
  add: (entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => void
  clear: () => void
}

export const useDebugLogStore = create<DebugLogState>()(
  persist(
    (set) => ({
      enabled: false,
      entries: [],

      setEnabled: (enabled) => set({ enabled }),

      // Newest first, capped at MAX_ENTRIES so the buffer can't grow unbounded.
      add: (entry) =>
        set((state) => ({
          entries: [
            { ...entry, id: `${Date.now()}-${seq++}`, timestamp: Date.now() },
            ...state.entries,
          ].slice(0, MAX_ENTRIES),
        })),

      clear: () => set({ entries: [] }),
    }),
    {
      name: 'git-manager-debug-log',
      // Persist only the opt-in flag — never the captured entries.
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
)
