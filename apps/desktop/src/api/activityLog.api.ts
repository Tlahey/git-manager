import { openActivityLogsDir, openAiLogsDir } from '../lib/tauri'

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
