import type { AiConnectionConfig, DailySummary } from '@git-manager/ai'
import { apiGetAiActivity, dailySummaryService } from '../api/ai.api'
import { useDailySummaryStore } from '../stores/dailySummary.store'
import { hoursForSummaryWindow } from './dailySummaryWindow'

/**
 * Generates one project's daily briefing end-to-end: gather the repo's recent git activity, run
 * `@git-manager/ai`'s daily-summary feature, and persist the result in the launchpad store. Shared
 * by the on-demand hook (`useDailySummary`) and the morning auto-run (`useMorningSummaries`) so both
 * paths produce and store summaries identically.
 */
export async function generateDailySummary(
  path: string,
  aiConnection: AiConnectionConfig,
  language: string
): Promise<DailySummary> {
  const activity = await apiGetAiActivity(path, hoursForSummaryWindow())
  // Language is a frontend/Settings concern (not from Rust) — inject it so the briefing is written
  // in the user's UI language.
  activity.language = language
  const summary = await dailySummaryService.run(aiConnection, activity)
  useDailySummaryStore.getState().setSummary(path, summary)
  return summary
}
