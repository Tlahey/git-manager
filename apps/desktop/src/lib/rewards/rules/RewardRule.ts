import type { Achievement, RuleContext, RuleKind } from '../types'

/**
 * Strategy interface: one implementation per `RuleKind`. `rewardEngine.ts` never branches on
 * `achievement.kind` itself — it always goes through `ruleRegistry.getRule(kind)` and calls
 * these two methods, so adding a new kind never requires touching the engine or an existing
 * rule (see docs/architecture/15-rewards-system-refactor-plan.md, "Strategy — one class per
 * trigger kind").
 */
export interface RewardRule {
  readonly kind: RuleKind

  /**
   * Optional bookkeeping run for every achievement of this kind on every event, before
   * `matches` is evaluated for any achievement. Used by rules that need to accumulate state
   * across events rather than decide in a single step — currently only `PairEventRule`
   * (recording which files were staged, so a later `unstage` of the same file can match).
   * Mutates `ctx.pairTracking` only; never mutates `achievement`.
   */
  track?(achievement: Achievement, ctx: RuleContext): void

  /** Pure predicate: should `achievement` unlock given this event? Must not mutate anything. */
  matches(achievement: Achievement, ctx: RuleContext): boolean
}
