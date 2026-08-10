import { invoke } from './invoke'

// ─── Activity log ─────────────────────────────────────────────────────────────

/** Reveals the on-disk activity-logs directory in the Finder (creating it if needed). */
export const openActivityLogsDir = () => invoke<void>('open_activity_logs_dir')

/** Reveals the AI transcript directory (`~/.git-manager/ai-logs/`) in the Finder. */
export const openAiLogsDir = () => invoke<void>('open_ai_logs_dir')

// Reading the log back is deliberately NOT wrapped here — see `readPersistedActivityLog` in
// `lib/activityLogPersistence.ts`, which owns both halves of the raw-invoke exception.
