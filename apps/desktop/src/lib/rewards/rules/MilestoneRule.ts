import type { AppEvent } from '../../appEventBus'
import type { Achievement, EngineCounters, MilestoneType, RuleContext } from '../types'
import type { RewardRule } from './RewardRule'

const EVENT_TO_MILESTONE_TYPE: Partial<Record<AppEvent, MilestoneType>> = {
  commit: 'commit',
  pr_closed_or_merged: 'pr_merged',
}

const MILESTONE_TYPE_TO_COUNTER: Record<'commit' | 'pr_merged', keyof EngineCounters> = {
  commit: 'commitCount',
  pr_merged: 'prMergedCount',
}

/**
 * Unlocks once a running counter (commits made, PRs merged/closed) reaches
 * `achievement.milestoneValue`. Deliberately doesn't handle `milestoneType: 'terminal_command'`
 * — that shape is matched by `TerminalKeywordRule` instead, which compares the raw command
 * string rather than a counter threshold (every terminal-command achievement in
 * `achievements.json` has `milestoneValue: 1`, so a counter comparison would be meaningless).
 */
export class MilestoneRule implements RewardRule {
  readonly kind = 'milestone' as const

  matches(achievement: Achievement, ctx: RuleContext): boolean {
    const milestoneType = achievement.milestoneType
    if (!milestoneType || milestoneType === 'terminal_command' || achievement.milestoneValue === undefined) {
      return false
    }
    if (EVENT_TO_MILESTONE_TYPE[ctx.event] !== milestoneType) return false

    const counterKey = MILESTONE_TYPE_TO_COUNTER[milestoneType]
    return ctx.counters[counterKey] >= achievement.milestoneValue
  }
}
