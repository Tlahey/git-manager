import { StepRailRow } from '@git-manager/components'
import { useTranslation } from '@git-manager/i18n'
import type { RebaseProgressStep, RebaseState } from '@git-manager/git-types'
import {
  badgeVariantForAction,
  railProgressForStatus,
  railVariantForAction,
  stepTitle,
} from '../rebaseStepView'

interface RebaseStepListProps {
  rebaseState: RebaseState
  /** Files still conflicted, live — decides what the paused step's caption says. */
  conflictedCount: number
  /**
   * Clicking a step. Takes the whole step, not just an oid, because what a click *means* depends
   * on where the step stands: the one git stopped on has work to do (the caller shows the
   * conflicted files), the others just point at a commit to inspect.
   */
  onSelectStep?: (step: RebaseProgressStep) => void
  /** Whether a given step can be opened at all — the caller knows which commits the graph holds,
   * and a row that would open an empty panel shouldn't look clickable. */
  isStepSelectable?: (step: RebaseProgressStep) => boolean
  selectedOid?: string | null
  /** True while the conflicted-files panel is the one on screen, so the paused step reads as the
   * selected row even though the graph's selection is the synthetic CONFLICT row. */
  currentStepActive?: boolean
}

/**
 * The rebase's todo list as a rail, oldest step first — the same top-down order the
 * interactive-rebase editor uses, so the plan the user wrote and its replay read alike. The
 * commit everything is replayed onto anchors the top; each step below shows whether it's been
 * applied, is the one git stopped on, or is still ahead.
 */
export function RebaseStepList({
  rebaseState,
  conflictedCount,
  onSelectStep,
  isStepSelectable,
  selectedOid,
  currentStepActive,
}: RebaseStepListProps) {
  const { t } = useTranslation('git')
  const { steps } = rebaseState

  if (steps.length === 0) {
    return (
      <p
        className="px-6 py-8 text-center text-xs text-muted-foreground"
        data-testid="rebase-progress-empty"
      >
        {t('rebaseProgress.emptyPlan')}
      </p>
    )
  }

  return (
    <div data-testid="rebase-step-list">
      {/* Base row: not a step, but the rail has to start somewhere the user recognizes. */}
      <StepRailRow
        index={0}
        isLast={false}
        isSelected={false}
        progress="done"
        draggable={false}
        title={t('rebaseProgress.baseRow', {
          ref: rebaseState.ontoLabel ?? rebaseState.ontoShortOid ?? '',
        })}
        subtitle={rebaseState.ontoSubject}
        badgeLabel={t('rebaseProgress.baseBadge')}
        badgeVariant="outline"
        trailingCaption={rebaseState.ontoShortOid}
        testId="rebase-step-base"
      />

      {steps.map((step, position) => {
        // The paused step is always openable — it's the one with work to do, and clicking it is
        // how the user gets back to the files to resolve. Any other step only opens if the caller
        // says its commit is reachable, so a click can't land on an empty details panel.
        const selectable =
          !!onSelectStep && (step.status === 'current' || (isStepSelectable?.(step) ?? !!step.oid))

        return (
          <StepRailRow
            key={`${step.index}-${step.oid ?? step.action}`}
            // 1-based: the base row above owns index 0, so every step draws its top connector.
            index={step.index}
            isLast={position === steps.length - 1}
            isSelected={
              step.status === 'current'
                ? !!currentStepActive
                : !!step.oid && step.oid === selectedOid
            }
            progress={railProgressForStatus(step.status)}
            variant={railVariantForAction(step.action)}
            draggable={false}
            title={stepTitle(step)}
            subtitle={
              <StepSubtitle step={step} kind={rebaseState.kind} conflictedCount={conflictedCount} />
            }
            badgeLabel={step.action}
            badgeVariant={badgeVariantForAction(step.action)}
            trailingCaption={step.shortOid}
            testId={`rebase-step-${step.index}`}
            onRowClick={selectable ? () => onSelectStep?.(step) : undefined}
          />
        )
      })}
    </div>
  )
}

/**
 * What the row means right now. Only the paused step needs words — it's the one the user has to
 * act on, and how many files are left decides whether "continue" is even available.
 */
function StepSubtitle({
  step,
  kind,
  conflictedCount,
}: {
  step: RebaseProgressStep
  kind: RebaseState['kind']
  conflictedCount: number
}) {
  const { t } = useTranslation('git')

  if (step.status !== 'current') {
    return step.status === 'done' ? t('rebaseProgress.stepDone') : t('rebaseProgress.stepPending')
  }

  if (kind === 'edit_pause') return t('rebaseProgress.stepCurrentEdit')

  return conflictedCount > 0
    ? t('rebaseProgress.stepCurrentConflicts', { count: conflictedCount })
    : t('rebaseProgress.stepCurrentResolved')
}
