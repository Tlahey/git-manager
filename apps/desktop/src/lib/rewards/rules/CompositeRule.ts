import type { Achievement, RuleContext } from '../types'
import type { RewardRule } from './RewardRule'

/**
 * Meta-achievement: unlocks once every achievement except the ids in `requiresAllExcept` (which
 * always includes the composite achievement's own id, to avoid a trivial self-reference) is
 * unlocked. Today only the platinum trophy uses this (`requiresAllExcept: ["platinum_trophy"]`),
 * but a second meta-achievement (e.g. "unlock all bronze") is just another JSON entry — no
 * engine change needed.
 *
 * `matches` ignores `ctx.event`: composite achievements are re-checked after *any* unlock in the
 * same `processEvent` call, regardless of which event triggered it — see
 * `rewardEngine.ts#processEvent`, which evaluates composite rules in a second pass using the
 * post-unlock `allAchievements` snapshot. The caller (the store) is expected to defer the actual
 * unlock so its toast doesn't collide with the "normal" unlock that completed the set.
 */
export class CompositeRule implements RewardRule {
  readonly kind = 'composite' as const

  matches(achievement: Achievement, ctx: RuleContext): boolean {
    if (!achievement.requiresAllExcept) return false
    const excluded = new Set([achievement.id, ...achievement.requiresAllExcept])
    return ctx.allAchievements.every((a) => excluded.has(a.id) || a.unlocked)
  }
}
