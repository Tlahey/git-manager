import type { AppEvent } from '../appEventBus'
import { getRule } from './ruleRegistry'
import type { Achievement, EngineCounters, RuleContext } from './types'

/** Everything the engine needs, and nothing it doesn't — no Zustand, no React, no persistence
 *  concerns. `stores/game.store.ts` owns those; this module only knows how to compute the next
 *  set of unlocks from the current one. */
export interface RewardEngineState {
  achievements: Achievement[]
  points: number
  commitCount: number
  prMergedCount: number
  terminalCommandCount: number
  /** Per-achievement pair-tracking sets (see `PairEventRule`), keyed by achievement id. */
  pairTracking: Map<string, Set<string>>
}

export interface ProcessEventResult {
  nextState: RewardEngineState
  newlyUnlocked: Achievement[]
  /** Composite achievements (e.g. the platinum trophy) whose condition just became true, but
   *  that have deliberately NOT been unlocked yet — see `CompositeRule` for why. The caller
   *  decides when/how to actually apply the unlock (`unlockAchievementById`). */
  pendingComposites: Achievement[]
}

const EVENT_TO_COUNTER_KEY: Partial<Record<AppEvent, keyof EngineCounters>> = {
  commit: 'commitCount',
  pr_closed_or_merged: 'prMergedCount',
  terminal_command: 'terminalCommandCount',
}

function isPrerequisiteSatisfied(achievement: Achievement, achievements: Achievement[]): boolean {
  if (!achievement.prerequisiteId) return true
  return achievements.find((a) => a.id === achievement.prerequisiteId)?.unlocked ?? false
}

/**
 * Unlocks a single achievement by id if it exists, isn't already unlocked, and its prerequisite
 * (if any) is satisfied — the one place prerequisite-checking lives, replacing the same check
 * that used to be duplicated three times in `game.store.ts`. Pure: takes the current
 * achievements/points and returns new values, never mutates its inputs. Returns `null` if the
 * unlock can't happen (unknown id, already unlocked, or prerequisite not met).
 */
export function unlockAchievementById(
  achievements: Achievement[],
  points: number,
  id: string
): { achievements: Achievement[]; points: number; unlocked: Achievement } | null {
  const item = achievements.find((a) => a.id === id)
  if (!item || item.unlocked) return null
  if (!isPrerequisiteSatisfied(item, achievements)) return null

  const unlockedAt = Date.now()
  const unlocked: Achievement = { ...item, unlocked: true, unlockedAt }
  const nextAchievements = achievements.map((a) => (a.id === id ? unlocked : a))

  return { achievements: nextAchievements, points: points + item.points, unlocked }
}

/**
 * Runs every non-composite rule against `event` (in `achievements.json` order, matching the
 * original store's iteration order) and unlocks whichever achievements match. Composite
 * achievements are evaluated in a second pass, against the post-unlock snapshot, but are
 * reported via `pendingComposites` rather than unlocked immediately — see `CompositeRule`.
 */
export function processEvent(
  state: RewardEngineState,
  event: AppEvent,
  payload: unknown
): ProcessEventResult {
  let achievements = state.achievements
  let points = state.points
  const newlyUnlocked: Achievement[] = []

  const counters: EngineCounters = {
    commitCount: state.commitCount,
    prMergedCount: state.prMergedCount,
    terminalCommandCount: state.terminalCommandCount,
  }
  const counterKey = EVENT_TO_COUNTER_KEY[event]
  if (counterKey) counters[counterKey] += 1

  const pairTracking = new Map<string, Set<string>>(
    Array.from(state.pairTracking.entries()).map(([id, files]) => [id, new Set(files)])
  )

  const tryUnlock = (id: string) => {
    const result = unlockAchievementById(achievements, points, id)
    if (!result) return
    achievements = result.achievements
    points = result.points
    newlyUnlocked.push(result.unlocked)
  }

  for (const definition of state.achievements) {
    if (definition.kind === 'composite') continue // second pass, below
    const rule = getRule(definition.kind)
    const current = achievements.find((a) => a.id === definition.id)!
    const ctx: RuleContext = {
      event,
      payload,
      counters,
      pairTracking,
      allAchievements: achievements,
    }
    rule.track?.(current, ctx)
    if (!current.unlocked && rule.matches(current, ctx)) {
      tryUnlock(definition.id)
    }
  }

  const pendingComposites: Achievement[] = []
  const compositeRule = getRule('composite')
  for (const achievement of achievements) {
    if (achievement.kind !== 'composite' || achievement.unlocked) continue
    const ctx: RuleContext = {
      event,
      payload,
      counters,
      pairTracking,
      allAchievements: achievements,
    }
    if (compositeRule.matches(achievement, ctx)) {
      pendingComposites.push(achievement)
    }
  }

  return {
    nextState: {
      achievements,
      points,
      commitCount: counters.commitCount,
      prMergedCount: counters.prMergedCount,
      terminalCommandCount: counters.terminalCommandCount,
      pairTracking,
    },
    newlyUnlocked,
    pendingComposites,
  }
}
