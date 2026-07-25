import type { StepRailProgress } from '@git-manager/components'
import type { RebaseProgressStep } from '@git-manager/git-types'

// The action→badge/rail mapping is shared with the interactive-rebase editor so the same command
// reads the same in the plan the user composes and in the rebase they're watching run.
export { badgeVariantForAction, railVariantForAction } from '../../lib/rebaseActionStyles'

/**
 * `RebaseProgressStatus` is the same three values the rail draws, but they're separate
 * vocabularies (git state vs. presentation) — an unknown status degrades to `pending` rather
 * than being trusted blindly, since it arrives over IPC as a plain string.
 */
export function railProgressForStatus(status: string): StepRailProgress {
  return status === 'done' || status === 'current' ? status : 'pending'
}

/**
 * Text shown for a step: its commit subject, or its argument text for commands that carry no
 * commit (`exec cargo test`). Falls back to the command name so a row is never blank — `break`
 * has neither, and an unreachable commit can leave a `pick` with no subject.
 */
export function stepTitle(step: RebaseProgressStep): string {
  return step.subject?.trim() || step.action
}

/**
 * The step the rebase is stopped on, if any. Only one step is ever `current` (see
 * `services/git_rebase_plan.rs`), so the first match is the answer.
 */
export function findCurrentStep(steps: RebaseProgressStep[]): RebaseProgressStep | undefined {
  return steps.find((step) => step.status === 'current')
}

/** How many steps have been replayed, for the progress readout when git's counters are absent. */
export function countDoneSteps(steps: RebaseProgressStep[]): number {
  return steps.filter((step) => step.status === 'done').length
}
