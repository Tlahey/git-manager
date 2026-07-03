import type { Achievement, RuleContext } from '../types'
import type { RewardRule } from './RewardRule'

function commandFromPayload(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'command' in payload) {
    const command = (payload as { command: unknown }).command
    if (typeof command === 'string') return command
  }
  return ''
}

/**
 * Unlocks the first time a terminal command containing `achievement.commandKeyword` (case
 * insensitive substring match) is observed on a `terminal_command` event. Distinct from
 * `MilestoneRule` because the trigger is a string match, not a counter threshold.
 */
export class TerminalKeywordRule implements RewardRule {
  readonly kind = 'terminal_keyword' as const

  matches(achievement: Achievement, ctx: RuleContext): boolean {
    if (ctx.event !== 'terminal_command' || !achievement.commandKeyword) return false
    const command = commandFromPayload(ctx.payload).trim().toLowerCase()
    if (!command) return false
    return command.includes(achievement.commandKeyword.toLowerCase())
  }
}
