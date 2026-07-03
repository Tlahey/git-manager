import type { RuleKind } from './types'
import type { RewardRule } from './rules/RewardRule'
import { ActionRule } from './rules/ActionRule'
import { MilestoneRule } from './rules/MilestoneRule'
import { TerminalKeywordRule } from './rules/TerminalKeywordRule'
import { PairEventRule } from './rules/PairEventRule'
import { CompositeRule } from './rules/CompositeRule'

/**
 * kind → RewardRule lookup, the single place that knows about every concrete rule
 * implementation. `rewardEngine.ts` calls `getRule(achievement.kind)` and never imports a
 * concrete rule class directly — that's what makes adding a new `RuleKind` purely additive
 * (new class + one line here, per docs/architecture/15-rewards-system-refactor-plan.md).
 *
 * All current rules are stateless (they read everything they need from the `Achievement` and
 * `RuleContext` arguments passed to `matches`/`track`), so a single shared instance per kind is
 * enough — no per-achievement construction step is needed today. If a future rule kind needs
 * config baked in at construction time, turn `RULES` into a `createRule(definition)` factory at
 * that point; introducing that indirection now, with nothing that needs it, would be the same
 * over-engineering mistake already caught (and reverted) twice elsewhere in this codebase for a
 * `GitGraphBuilder` and a `DiffRenderStrategy` — see
 * docs/architecture/14-architecture-refactor-tracking.md, actions 3.2 and 5.1/5.2.
 */
const RULES: Record<RuleKind, RewardRule> = {
  action: new ActionRule(),
  milestone: new MilestoneRule(),
  terminal_keyword: new TerminalKeywordRule(),
  pair: new PairEventRule(),
  composite: new CompositeRule(),
}

export function getRule(kind: RuleKind): RewardRule {
  return RULES[kind]
}
