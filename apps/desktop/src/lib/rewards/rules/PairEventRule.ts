import type { Achievement, RuleContext } from '../types'
import type { RewardRule } from './RewardRule'

function filePathFromPayload(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'filePath' in payload) {
    const filePath = (payload as { filePath: unknown }).filePath
    if (typeof filePath === 'string' && filePath) return filePath
  }
  return 'default'
}

/**
 * Unlocks when `endEvent` fires for the same file that a prior `startEvent` recorded — e.g.
 * `stage_unstage` ("Indécis Indiscutable"): stage a file, then unstage that same file.
 *
 * State (`ctx.pairTracking`) is keyed per achievement id, so several independent pair
 * achievements can coexist without sharing a tracking set. `track()` records `startEvent`
 * occurrences unconditionally (even if the achievement is already unlocked) — cheap, and
 * matches the original behavior of the code this replaces.
 */
export class PairEventRule implements RewardRule {
  readonly kind = 'pair' as const

  track(achievement: Achievement, ctx: RuleContext): void {
    if (!achievement.startEvent || ctx.event !== achievement.startEvent) return
    const file = filePathFromPayload(ctx.payload)
    if (!ctx.pairTracking.has(achievement.id)) {
      ctx.pairTracking.set(achievement.id, new Set())
    }
    ctx.pairTracking.get(achievement.id)!.add(file)
  }

  matches(achievement: Achievement, ctx: RuleContext): boolean {
    if (!achievement.endEvent || ctx.event !== achievement.endEvent) return false
    const file = filePathFromPayload(ctx.payload)
    return ctx.pairTracking.get(achievement.id)?.has(file) ?? false
  }
}
