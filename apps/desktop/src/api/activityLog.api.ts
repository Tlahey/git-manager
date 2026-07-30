import { openActivityLogsDir, openAiLogsDir } from '../lib/tauri'
import { readPersistedActivityLog } from '../lib/activityLogPersistence'
import type { ActivityLogEntry } from '../stores/activityLog.store'

/** Reveals the on-disk activity-logs directory in the Finder (creating it first if needed). */
export function apiOpenActivityLogsDir(): Promise<void> {
  return openActivityLogsDir()
}

/** Reveals the AI transcript directory in the Finder. Separate from the activity logs: it holds one
 * file per day of full prompts and model answers, which is what an AI bug needs and what the
 * activity log cannot carry (arguments only, truncated to 200 characters, no return values). */
export function apiOpenAiLogsDir(): Promise<void> {
  return openAiLogsDir()
}

/**
 * Reads the most recent activity entries back off disk, newest first, validated.
 *
 * For the "Behind the scenes" window only. That window is its own `WebviewWindow`, so the in-memory
 * buffer `lib/tauri.ts` fills is in another JS context entirely — disk is the only surface the two
 * share. The main window's own Activity Logs view keeps reading the store directly, which is live.
 *
 * `maxEntries` bounds *lines read*, not actions shown: the caller keeps only the operations that
 * changed something, and a repository under polling writes far more reads than writes.
 *
 * Goes through `lib/activityLogPersistence.ts` rather than `lib/tauri.ts` — the one call in the app
 * that must not be recorded in the activity log, because it *is* the activity log (see that module).
 */
export async function apiReadActivityLog(maxEntries: number): Promise<ActivityLogEntry[]> {
  return readPersistedActivityLog(maxEntries)
}
