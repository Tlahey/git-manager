/**
 * A running AI generation, as a notch card.
 *
 * The reason this is worth a card at all is the map phase: every two-phase feature reads the
 * changeset one model call *per file*, so a branch of forty files against a local model is minutes.
 * Nobody watches a bar for minutes — they switch to their editor, and the run goes invisible. The
 * footer pill already covers the case where the user is looking at the app; this covers the case
 * where they aren't.
 *
 * A pure builder, like `features/ai-search/lib/commitSearchNotch.ts`: the card for every feature, every count and every
 * missing origin is assertable without a provider, a repository or a model.
 */

import type { TFunction } from '@git-manager/i18n'
import type { NotchModel } from '@git-manager/notch'
import type { AiPhaseProgress, AiRun } from '../../stores/aiActivity.store'
import { aiPhaseBelongsTo, aiPhaseDetail, aiRunLabel } from '../aiRunPresentation'
import type { NotificationRoute } from './notificationRoute'

/**
 * One card for all AI work, rather than one per run.
 *
 * A map phase is *many* runs — one per file, each beginning and ending — so an id per run would
 * queue forty cards for one button press. A single id makes every tick an in-place update of the
 * card already on screen, which is what the queue's coalescing is for.
 */
export const AI_RUN_NOTCH_ID = 'ai-run'

/**
 * Features that already have a richer card of their own.
 *
 * The commit search runs its own progress card, with its question, its per-commit counts and a
 * cancel button. A generic "the model is working" card alongside it would not add anything and,
 * carrying a different id, would sit in the queue behind it until the search finished — so the
 * user's *own* search would be what hid it.
 */
const FEATURES_WITH_THEIR_OWN_CARD = new Set([
  'commit-quick-scan',
  'commit-file-scan',
  'commit-relevance',
  'commit-search-answer',
])

export function aiRunHasItsOwnCard(featureId: string): boolean {
  return FEATURES_WITH_THEIR_OWN_CARD.has(featureId)
}

export interface AiRunNotchInput {
  run: AiRun
  /** The map phase's count, feature-tagged — used only when it belongs to this run's feature. */
  progress: AiPhaseProgress | null
  /** The repository's own name, for the card's context line. Absent for a run with no origin. */
  repoName?: string
  t: TFunction
}

/** Where clicking the card lands, or nothing at all for a run that has nowhere to return to. */
export function aiRunNotchRoute(run: AiRun): NotificationRoute | undefined {
  if (!run.origin) return undefined
  return {
    kind: 'ai-run',
    repoPath: run.origin.repoPath,
    ...(run.origin.panel ? { panel: run.origin.panel } : {}),
  }
}

/**
 * What the notch should show for a generation in flight.
 *
 * Always a `progress` card, never a terminal one: the activity store records that a run *ended*,
 * not whether it succeeded, so a "done" card built from here would be a guess. Announcing the
 * result is a separate job for whoever owns it, and claiming success on a failed review would be
 * worse than saying nothing.
 */
export function aiRunNotchModel(input: AiRunNotchInput): NotchModel {
  const { run, progress, repoName, t } = input

  return {
    kind: 'progress',
    id: AI_RUN_NOTCH_ID,
    tone: 'running',
    eyebrow: t('aiStatus.notch.eyebrow'),
    ...(repoName ? { context: repoName } : {}),
    // The action the user asked for, not the small call currently open — see `aiRunLabel`. Which
    // file of how many is the detail line's job, one row below.
    title: aiRunLabel(run, progress, t),
    ...ratioFor(run, progress),
    ...detailFor(run, progress, t),
    ...(run.origin
      ? { actions: [{ id: 'activate', label: t('aiStatus.notch.open'), variant: 'primary' }] }
      : {}),
  }
}

/**
 * The bar's fill — absent unless a map phase with more than one step is driving this run.
 *
 * A streaming feature has no steps to report, and a single-call phase rendered as "0 of 1" is a bar
 * sitting at zero for as long as the call takes, which reads as stalled. An indeterminate bar reads
 * as working, which is what is true.
 */
function ratioFor(run: AiRun, progress: AiPhaseProgress | null): { ratio?: number } {
  if (!aiPhaseBelongsTo(run, progress) || progress.total <= 1) return {}
  return { ratio: Math.min(1, progress.completed / progress.total) }
}

/** The phase and its count — "Reading the files — 3 / 12". Shares its rule with the footer's own
 * count, so the card and the pill can never disagree about how far a phase has got. */
function detailFor(
  run: AiRun,
  progress: AiPhaseProgress | null,
  t: TFunction
): { detail?: string } {
  const detail = aiPhaseDetail(run, progress, t)
  return detail ? { detail } : {}
}
