import type { StoredSummaryFile } from '@git-manager/git-types'
import {
  deleteDailySummary,
  listDailySummaries,
  openDailySummariesDir,
  saveDailySummary,
} from '../lib/tauri'

/**
 * The on-disk archive of daily briefings (`~/.git-manager/summaries/`).
 *
 * Kept out of `ai.api.ts` deliberately: nothing here talks to a model. This is file persistence for
 * the feature's *output*, and the summaries page reads it without the AI provider being configured
 * at all — an archive you can only open when your LLM is running would be a poor archive.
 */

/** Writes one morning's briefing, returning the path of the file written. `alsoInRepo` additionally
 * writes it inside the repository (opt-in; the writer registers `.git-manager/` in
 * `.git/info/exclude` so the copies never appear as pending changes). */
export async function apiSaveDailySummary(
  repoPath: string,
  date: string,
  markdown: string,
  alsoInRepo: boolean
): Promise<string> {
  return saveDailySummary(repoPath, date, markdown, alsoInRepo)
}

/** Reads the whole archive — every repository, every retained day — newest first. */
export async function apiListDailySummaries(): Promise<StoredSummaryFile[]> {
  return listDailySummaries()
}

export async function apiDeleteDailySummary(filePath: string): Promise<void> {
  return deleteDailySummary(filePath)
}

/** Reveals the archive directory in the Finder. */
export async function apiOpenDailySummariesDir(): Promise<void> {
  return openDailySummariesDir()
}
