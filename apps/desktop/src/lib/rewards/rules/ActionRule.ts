import type { Achievement, RuleContext } from '../types'
import type { RewardRule } from './RewardRule'

/**
 * Unlocks the first time a specific `AppEvent` fires — e.g. `discard`, `fixup`, `autosquash`,
 * or `open_launchpad`. One-shot, no counting, no payload inspection.
 *
 * Which means the event *is* the whole condition: this rule can only be as trustworthy as its
 * trigger, so an event raised from a mount or a poll rather than from a user's gesture unlocks an
 * achievement nobody earned (see `lib/appEventBus.ts`).
 */
export class ActionRule implements RewardRule {
  readonly kind = 'action' as const

  matches(achievement: Achievement, ctx: RuleContext): boolean {
    return achievement.event !== undefined && achievement.event === ctx.event
  }
}
