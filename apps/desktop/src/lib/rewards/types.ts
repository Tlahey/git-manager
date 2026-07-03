import type { AppEvent } from '../appEventBus'

/**
 * Shared types for the rewards engine. See `README.md` in this folder for the full picture and
 * `docs/architecture/15-rewards-system-refactor-plan.md` for the audit that motivated this
 * module (the original design lived entirely inside `stores/game.store.ts`).
 */

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum'
export type AchievementDifficulty = 'beginner' | 'intermediate' | 'expert'
export type MilestoneType = 'commit' | 'pr_merged' | 'terminal_command'

/**
 * Which `RewardRule` (see `rules/`) governs how an achievement unlocks. Every kind here must
 * have a matching entry in `ruleRegistry.ts` — adding a new kind means adding a new rule class
 * and registering it, never editing an existing rule.
 */
export type RuleKind = 'action' | 'milestone' | 'terminal_keyword' | 'pair' | 'composite'

/**
 * A cosmetic unlock granted by an achievement, read by UI code that needs to know "is X locked"
 * (theme picker, avatar frame, ...) without hardcoding achievement ids. See `effects.ts`.
 */
export interface RewardEffect {
  type: 'theme' | 'avatarFrame'
  id: string
}

/**
 * Static definition of one achievement, as stored in `achievements.json`. Fields below `kind`
 * are only meaningful for the matching rule kind (documented per field) — this mirrors the
 * shape achievements.json already had rather than forcing a strict per-kind discriminated union,
 * since some fields (`milestoneType`/`milestoneValue`) are also read directly by `RewardsTab.tsx`
 * for progress bars, independently of which rule interprets them.
 */
export interface AchievementDefinition {
  id: string
  title: string
  description: string
  points: number
  type: AchievementTier
  difficulty: AchievementDifficulty
  rewardDescription: string
  kind: RuleKind
  prerequisiteId?: string
  effects?: RewardEffect[]

  /** kind: 'action' — unlocks the first time this exact AppEvent fires. */
  event?: AppEvent

  /** kind: 'milestone' — unlocks once the matching counter reaches milestoneValue. Also read
   *  by RewardsTab.tsx to render the "Fil Rouge" progress bar, including for kind: 'terminal_keyword'
   *  achievements (which set milestoneType: 'terminal_command', milestoneValue: 1). */
  milestoneType?: MilestoneType
  milestoneValue?: number

  /** kind: 'terminal_keyword' — unlocks the first time a terminal command containing this
   *  substring (case-insensitive) is observed. */
  commandKeyword?: string

  /** kind: 'pair' — unlocks when `endEvent` fires for the same payload key (file path) that a
   *  prior `startEvent` recorded. */
  startEvent?: AppEvent
  endEvent?: AppEvent

  /** kind: 'composite' — unlocks once every achievement except the ids listed here (and itself)
   *  is unlocked. */
  requiresAllExcept?: string[]
}

/** Runtime achievement: static definition + unlock state. */
export interface Achievement extends AchievementDefinition {
  unlocked: boolean
  unlockedAt?: number
}

export interface EngineCounters {
  commitCount: number
  prMergedCount: number
  terminalCommandCount: number
}

/**
 * Everything a `RewardRule` needs to decide whether an achievement should unlock. Built fresh
 * by `rewardEngine.processEvent` for each event; rules must treat it as read-only except via the
 * mutable `pairTracking` map, which exists specifically for rules that need to accumulate state
 * across events (see `PairEventRule`).
 */
export interface RuleContext {
  event: AppEvent
  payload: unknown
  counters: EngineCounters
  /** Per-achievement bookkeeping set, keyed by achievement id. Only 'pair'-kind rules use this. */
  pairTracking: Map<string, Set<string>>
  /** Live snapshot of all achievements, reflecting unlocks already applied earlier in the same
   *  event (used by CompositeRule, which needs to know about every other achievement). */
  allAchievements: Achievement[]
}
