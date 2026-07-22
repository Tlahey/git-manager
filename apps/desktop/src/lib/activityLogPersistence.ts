import { invoke } from '@tauri-apps/api/core'
import type { ActivityLogEntry } from '../stores/activityLog.store'

/**
 * Best-effort disk persistence for the activity log. The in-memory store only keeps the most recent
 * entries (see `activityLog.store.ts`); this streams every captured entry to a rotating on-disk log
 * — one JSONL file per day, pruned after a week — handled by the `append_activity_log` Rust command.
 *
 * Two deliberate choices:
 *  - It calls the RAW `invoke` from `@tauri-apps/api/core`, NOT the wrapped one in `lib/tauri.ts`.
 *    Routing it through the logging wrapper would record the persistence call itself and recurse.
 *  - Entries are batched and flushed on a short timer so a burst of IPC doesn't turn into a burst of
 *    disk writes. Failures are swallowed: disk logging must never surface to the user or block work.
 */

const FLUSH_DELAY_MS = 2000

let queue: ActivityLogEntry[] = []
let timer: ReturnType<typeof setTimeout> | null = null

/** Only persist inside a real Tauri window — no-op in tests, Storybook, or component previews. */
function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Queues one entry for the next flush to the on-disk rotating log. */
export function persistActivityEntry(entry: ActivityLogEntry): void {
  if (!inTauri()) return
  queue.push(entry)
  if (timer) return
  timer = setTimeout(() => void flushActivityLog(), FLUSH_DELAY_MS)
}

/** Ships the queued batch to the backend. Exported so a shutdown/blur hook can force a flush. */
export async function flushActivityLog(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (queue.length === 0) return
  const batch = queue
  queue = []
  try {
    await invoke('append_activity_log', { entries: batch })
  } catch {
    // Disk logging is best-effort; never let it surface to the user or block anything.
  }
}
