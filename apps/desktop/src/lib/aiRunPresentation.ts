/**
 * How a running AI generation is named, and how the user gets back to it.
 *
 * Shared because there is now more than one place that has to answer both questions — the footer
 * pill, and the notch card that follows a run out of the window. Two copies of the feature-label map
 * would drift the first time a feature is added, and the symptom would be a card labelled "Working…"
 * for something the footer names perfectly well.
 */

import type { TFunction } from '@git-manager/i18n'
import type { AiPhaseProgress, AiRun, AiRunOrigin } from '../stores/aiActivity.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { goToRepoContent } from '../stores/repoView.store'

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
 * How a map phase's count is worded, keyed by the phase's `AiFeature.id`.
 *
 * Named after what is being counted rather than left as a bare "3 / 12": now that the title says
 * which action is running, the count is the only place left to say what the model is doing right
 * now. A phase nobody has worded yet still gets its numbers, just without the noun.
 */
const AI_PHASE_DETAIL_KEYS: Record<string, string> = {
  'file-summary': 'aiStatus.notch.readingFiles',
  'commit-relevance': 'aiStatus.notch.readingCommits',
}

/**
 * Whether a published count belongs to the run being rendered.
 *
 * The count is published *between* calls and deliberately not cleared when the run list empties (a
 * sequential map phase would blank it for most of its life). Matching on the *phase* is what keeps a
 * finished phase's last count from being shown against the next, unrelated generation — including
 * against its own composing call, which is the very next run to begin.
 */
export function aiPhaseBelongsTo(
  run: AiRun,
  progress: AiPhaseProgress | null
): progress is AiPhaseProgress {
  return progress !== null && progress.featureId === run.featureId
}

/**
 * What to call the work in flight: the action the user asked for, not the call currently open.
 *
 * A two-phase feature spends most of its life in the map phase, one small call per file — so naming
 * the call meant a summary, a commit message and a briefing were all announced identically as
 * "Reading the files one by one…", and nothing said which button had been pressed. The phase is not
 * lost, it moves to the line that counts it ({@link aiPhaseDetail}).
 *
 * The name is therefore stable across both phases of one press: when the map ends and the composing
 * call begins, the run's own label is the same label the phase was borrowing.
 */
export function aiRunLabel(run: AiRun, progress: AiPhaseProgress | null, t: TFunction): string {
  if (aiPhaseBelongsTo(run, progress)) return aiFeatureLabel(progress.owner, t)
  return aiFeatureLabel(run.featureId, t)
}

/**
 * The count line for a run driven by a map phase — "Reading the files — 3 / 12".
 *
 * Absent unless the phase has more than one step: a single-call phase rendered as "0 of 1" says
 * nothing the spinner beside it hasn't already said.
 */
export function aiPhaseDetail(
  run: AiRun,
  progress: AiPhaseProgress | null,
  t: TFunction
): string | undefined {
  if (!aiPhaseBelongsTo(run, progress) || progress.total <= 1) return undefined
  const key = AI_PHASE_DETAIL_KEYS[progress.featureId] ?? 'aiStatus.notch.steps'
  return t(key, { done: progress.completed, total: progress.total })
}

/**
 * Takes the user to the generation that is running: its repository tab, then the panel it came from.
 *
 * The panel is restored *and* the centre slot's other claimants are cleared, the same handoff the AI
 * menu performs — otherwise the panel reopens behind whatever diff the user has since opened, which
 * would make the affordance look broken precisely when it is doing its job. Bringing the content
 * view forward is the same clearing one step out: the AI panels are drawn by the graph, so a tab
 * left on the board or the files view has no slot for one at all.
 *
 * Imperative store access rather than hooks: one caller is a footer button, the other is a Tauri
 * event listener with no component in scope.
 */
export function goToAiRun(origin: AiRunOrigin): void {
  const ui = useRepoUIStore.getState()
  if (ui.activeTab !== origin.repoPath) ui.setActiveTab(origin.repoPath)
  if (origin.panel) {
    goToRepoContent()
    ui.setActiveDiffFile(null)
    ui.setActivePrNumber(null)
    ui.setAiPanelTarget(origin.panel)
  }
}
