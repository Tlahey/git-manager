import { invoke } from '@tauri-apps/api/core'
import type { ActivityLogEntry } from '../stores/activityLog.store'

/**
 * Best-effort disk persistence for the activity log, and the validation of what comes back off it.
 * The in-memory store only keeps the most recent entries (see `activityLog.store.ts`); this streams
 * every captured entry to a rotating on-disk log — one JSONL file per day, pruned after a week —
 * handled by the `append_activity_log` Rust command.
 *
 * Two deliberate choices on the write path:
 *  - It calls the RAW `invoke` from `@tauri-apps/api/core`, NOT the wrapped one in `lib/tauri.ts`.
 *    Routing it through the logging wrapper would record the persistence call itself and recurse.
 *  - Entries are batched and flushed on a short timer so a burst of IPC doesn't turn into a burst of
 *    disk writes. Failures are swallowed: disk logging must never surface to the user or block work.
 *
 * The **read** path lives here too, and for the first of those reasons rather than for tidiness: a
 * read of the activity log that goes through the wrapper *writes to the activity log*. The journal
 * window polls, so that self-noise would accumulate at a steady rate and eventually crowd the real
 * actions out of the fixed number of lines the pool reads — the log would fill up with the act of
 * looking at it. So both directions share the raw-invoke exception, and both are exposed to the app
 * through `api/activityLog.api.ts` like everything else.
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

/**
 * Reads the most recent entries back off the rotating log, newest first, validated.
 *
 * Untyped over the wire because that is what crosses the boundary: entries are written verbatim as
 * whatever the frontend stored, so the backend has no schema for them — {@link parseActivityLogEntries}
 * is the schema. Outside a Tauri window there is no log to read, so the answer is an empty one.
 */
export async function readPersistedActivityLog(maxEntries: number): Promise<ActivityLogEntry[]> {
  if (!inTauri()) return []
  const raw = await invoke<unknown[]>('read_activity_log', { maxEntries })
  return parseActivityLogEntries(raw)
}

/** The fields an entry must carry to be usable at all. Anything else is optional, because the log
 * spans a week and an older app version may simply not have written it. */
function isPersistedEntry(value: unknown): value is ActivityLogEntry {
  if (value === null || typeof value !== 'object') return false
  const e = value as Partial<ActivityLogEntry>
  return (
    typeof e.id === 'string' &&
    typeof e.command === 'string' &&
    typeof e.timestamp === 'number' &&
    (e.status === 'ok' || e.status === 'error')
  )
}

/**
 * Validates entries read back from disk, dropping any that aren't recognisable.
 *
 * Dropping rather than repairing: the log is a week deep, so it can legitimately contain lines
 * written by an older version of the app whose shape has since changed — and an entry missing its
 * command or its timestamp has nothing left to show. `durationMs` is defaulted because it is the one
 * field a caller does arithmetic on.
 */
export function parseActivityLogEntries(raw: unknown): ActivityLogEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isPersistedEntry)
    .map((entry) => ({ ...entry, durationMs: entry.durationMs ?? 0 }))
}
