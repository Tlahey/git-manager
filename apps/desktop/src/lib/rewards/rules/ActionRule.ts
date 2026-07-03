import type { Achievement, RuleContext } from '../types'
import type { RewardRule } from './RewardRule'

/**
 * Unlocks the first time a specific `AppEvent` fires — e.g. `discard`, `fixup`, `autosquash`,
 * or `open_app` (→ `open_launchpad`). One-shot, no counting, no payload inspection.
 */
export class ActionRule implements RewardRule {
  readonly kind = 'action' as const

  matches(achievement: Achievement, ctx: RuleContext): boolean {
    return achievement.event !== undefined && achievement.event === ctx.event
  }
}
