import { openActivityLogsDir } from '../lib/tauri'

/** Reveals the on-disk activity-logs directory in the Finder (creating it first if needed). */
export function apiOpenActivityLogsDir(): Promise<void> {
  return openActivityLogsDir()
}
