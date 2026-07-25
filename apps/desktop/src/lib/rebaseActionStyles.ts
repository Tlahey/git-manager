import type { BadgeProps } from '@git-manager/ui'
import type { StepRailVariant } from '@git-manager/components'

/**
 * How a rebase todo command is drawn on a step rail, shared by the two views that show one:
 * the interactive-rebase editor (`components/rebase-editor`, the plan the user is composing) and
 * the rebase progress view (`components/rebase-progress`, the plan git is executing). Keeping a
 * single mapping is what makes a `squash` look like a `squash` in both.
 *
 * Git vocabulary, so it lives app-side rather than in the generic `StepRailRow` package component.
 * Keyed by plain string: the editor only ever produces pick/reword/squash/fixup/drop, but a
 * running rebase's todo can also hold `exec`, `break`, `label`, `reset`, `merge`, `update-ref`.
 */
const ACTION_BADGE_VARIANTS: Record<string, BadgeProps['variant']> = {
  pick: 'secondary',
  reword: 'warning',
  edit: 'warning',
  squash: 'success',
  fixup: 'success',
  drop: 'destructive',
}

/** Badge color for a todo command; commands the editor can't produce fall back to `outline`. */
export function badgeVariantForAction(action: string): BadgeProps['variant'] {
  return ACTION_BADGE_VARIANTS[action] ?? 'outline'
}

/** Squash/fixup fold into the step above them; a drop produces no commit at all. */
export function railVariantForAction(action: string): StepRailVariant {
  if (action === 'drop') return 'dropped'
  if (action === 'squash' || action === 'fixup') return 'combined'
  return 'normal'
}
