/**
 * How a running AI generation is named, and how the user gets back to it.
 *
 * Shared because there is now more than one place that has to answer both questions — the footer
 * pill, and the notch card that follows a run out of the window. Two copies of the feature-label map
 * would drift the first time a feature is added, and the symptom would be a card labelled "Working…"
 * for something the footer names perfectly well.
 */

import type { TFunction } from '@git-manager/i18n'
import type { AiRunOrigin } from '../stores/aiActivity.store'
import { useRepoUIStore } from '../stores/repoUI.store'

/**
 * What each running feature is called, keyed by its `AiFeature.id` from `@git-manager/ai`. A module
 * map can't call `t()`, so it holds keys and {@link aiFeatureLabel} resolves them.
 *
 * A feature missing from this map is still reported — it just falls back to the generic "Working…"
 * label rather than going unmentioned, which is the right way round for something whose whole job is
 * to prove the app hasn't frozen.
 */
export const AI_FEATURE_LABEL_KEYS: Record<string, string> = {
  'summary-commit-message': 'aiStatus.work.commitMessage',
  'summary-pr-description': 'aiStatus.work.prDescription',
  'change-explanation': 'aiStatus.work.changeExplanation',
  // One feature covers the branch, commit and working-tree explanations (it discriminates on its
  // input's scope), so they share one label rather than three that cannot be told apart here.
  'summary-explanation': 'aiStatus.work.summaryExplanation',
  'action-explanation': 'aiStatus.work.actionExplanation',
  'commit-recompose': 'aiStatus.work.commitRecompose',
  'code-review': 'aiStatus.work.codeReview',
  'summary-grouping': 'aiStatus.work.fileGrouping',
  'daily-summary': 'aiStatus.work.dailySummary',
  'summary-search': 'aiStatus.work.summarySearch',
  // The map phases, which is where the minutes go: naming them is what makes a long wait legible
  // rather than alarming.
  'file-summary': 'aiStatus.work.fileSummary',
  'commit-relevance': 'aiStatus.work.commitRelevance',
  'commit-search-answer': 'aiStatus.work.commitSearchAnswer',
}

/** The feature's human name, or the generic "Working…" for one this map has never heard of. */
export function aiFeatureLabel(featureId: string, t: TFunction): string {
  const key = AI_FEATURE_LABEL_KEYS[featureId]
  return key ? t(key) : t('aiStatus.working')
}

/**
 * Takes the user to the generation that is running: its repository tab, then the panel it came from.
 *
 * The panel is restored *and* the centre slot's other claimants are cleared, the same handoff the AI
 * menu performs — otherwise the panel reopens behind whatever diff the user has since opened, which
 * would make the affordance look broken precisely when it is doing its job.
 *
 * Imperative store access rather than hooks: one caller is a footer button, the other is a Tauri
 * event listener with no component in scope.
 */
export function goToAiRun(origin: AiRunOrigin): void {
  const ui = useRepoUIStore.getState()
  if (ui.activeTab !== origin.repoPath) ui.setActiveTab(origin.repoPath)
  if (origin.panel) {
    ui.setActiveDiffFile(null)
    ui.setActivePrNumber(null)
    ui.setAiPanelTarget(origin.panel)
  }
}
