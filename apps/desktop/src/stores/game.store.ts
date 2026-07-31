import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiGetTerminalCommands } from '../api/shell.api'
import { appEventBus, type AppEvent } from '../lib/appEventBus'
import {
  processEvent,
  unlockAchievementById,
  type RewardEngineState,
} from '../lib/rewards/rewardEngine'
import type { AchievementDefinition } from '../lib/rewards/types'
import JSON_ACHIEVEMENTS from './achievements.json'

/**
 * Client-side gamification state. Rule evaluation itself (which achievement unlocks on which
 * event) lives in `lib/rewards/` — this store only holds state, persists it, and adapts the
 * pure `rewardEngine.processEvent` result into Zustand `set()` calls + the delayed platinum-
 * trophy unlock. See docs/architecture/15-rewards-system-refactor-plan.md for why this split
 * exists (the whole engine used to live inline here).
 */
export type { Achievement } from '../lib/rewards/types'
import type { Achievement } from '../lib/rewards/types'

export interface GameState {
  achievements: Achievement[]
  points: number
  recentUnlock: Achievement | null
  historyChecked: string[] // List of terminal commands already processed
  pairTracking: Map<string, Set<string>> // Per-achievement session tracking, see PairEventRule

  rewardsEnabled: boolean

  // Counters
  commitCount: number
  prMergedCount: number
  terminalCommandCount: number

  // Actions
  clearRecentUnlock: () => void
  processAppEvent: (event: AppEvent, payload?: unknown) => void
  checkTerminalHistory: () => Promise<void>
  setRewardsEnabled: (enabled: boolean) => void
  resetGameProgress: () => void
}

const INITIAL_ACHIEVEMENTS: Achievement[] = (
  JSON_ACHIEVEMENTS as unknown as AchievementDefinition[]
).map((item) => ({
  ...item,
  unlocked: false,
  unlockedAt: undefined,
}))

// ─── Level Math ───────────────────────────────────────────────────────────────

/** Stable, locale-independent rank identifiers — resolved to display text via
 *  `t(\`rewards.rank.${rankId}\`)` (packages/i18n/locales/{en,fr}/launchpad.json), not stored as
 *  translated strings here (see AchievementDefinition's doc comment in lib/rewards/types.ts for
 *  why the same pattern applies to achievement text). */
export type RankId =
  | 'novice'
  | 'apprentice'
  | 'practitioner'
  | 'specialist'
  | 'grandmaster'
  | 'grandmasterPlatinum'

export function getLevelInfo(points: number, isPlatinumUnlocked = false) {
  if (isPlatinumUnlocked) {
    return {
      level: 5,
      rankId: 'grandmasterPlatinum' as RankId,
      min: 300,
      max: 500,
      frameClass: 'avatar-frame-platinum',
    }
  }
  if (points < 50) {
    return { level: 1, rankId: 'novice' as RankId, min: 0, max: 50, frameClass: '' }
  }
  if (points < 120) {
    return {
      level: 2,
      rankId: 'apprentice' as RankId,
      min: 50,
      max: 120,
      frameClass: 'avatar-frame-bronze',
    }
  }
  if (points < 200) {
    return {
      level: 3,
      rankId: 'practitioner' as RankId,
      min: 120,
      max: 200,
      frameClass: 'avatar-frame-silver',
    }
  }
  if (points < 300) {
    return {
      level: 4,
      rankId: 'specialist' as RankId,
      min: 200,
      max: 300,
      frameClass: 'avatar-frame-gold',
    }
  }
  return {
    level: 5,
    rankId: 'grandmaster' as RankId,
    min: 300,
    max: 500,
    frameClass: 'avatar-frame-neon',
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      achievements: INITIAL_ACHIEVEMENTS,
      points: 0,
      recentUnlock: null,
      historyChecked: [],
      pairTracking: new Map(),
      rewardsEnabled: true,

      commitCount: 0,
      prMergedCount: 0,
      terminalCommandCount: 0,

      clearRecentUnlock: () => {
        set({ recentUnlock: null })
      },

      processAppEvent: (event: AppEvent, payload?: unknown) => {
        if (!get().rewardsEnabled) return

        const engineState: RewardEngineState = {
          achievements: get().achievements,
          points: get().points,
          commitCount: get().commitCount,
          prMergedCount: get().prMergedCount,
          terminalCommandCount: get().terminalCommandCount,
          pairTracking: get().pairTracking,
        }

        const result = processEvent(engineState, event, payload)

        set({
          achievements: result.nextState.achievements,
          points: result.nextState.points,
          commitCount: result.nextState.commitCount,
          prMergedCount: result.nextState.prMergedCount,
          terminalCommandCount: result.nextState.terminalCommandCount,
          pairTracking: result.nextState.pairTracking,
        })

        if (result.newlyUnlocked.length > 0) {
          // Mirrors the original behavior: if several achievements unlock from the same event,
          // only the last one gets a toast (recentUnlock is a single slot, not a queue).
          set({ recentUnlock: result.newlyUnlocked[result.newlyUnlocked.length - 1] })
        }

        // Composite achievements (the platinum trophy) unlock 1s after the set that completed
        // them, so their toast doesn't visually collide with the "normal" unlock that just fired.
        result.pendingComposites.forEach((composite) => {
          setTimeout(() => {
            const unlockResult = unlockAchievementById(
              get().achievements,
              get().points,
              composite.id
            )
            if (!unlockResult) return
            set({
              achievements: unlockResult.achievements,
              points: unlockResult.points,
              recentUnlock: unlockResult.unlocked,
            })
          }, 1000)
        })
      },

      checkTerminalHistory: async () => {
        if (!get().rewardsEnabled) return
        try {
          // Fetch zsh/bash history from Tauri backend
          const commands = await apiGetTerminalCommands()
          if (!commands || commands.length === 0) return

          const checked = get().historyChecked
          const newCommands = commands.filter((c) => !checked.includes(c))

          if (newCommands.length > 0) {
            // Update checking registry first to prevent concurrency loops
            set({ historyChecked: [...checked, ...newCommands] })

            // Dispatch each new command event to the engine
            newCommands.forEach((cmd) => {
              appEventBus.notify('terminal_command', { command: cmd })
            })
          }
        } catch (e) {
          console.warn('Failed to retrieve terminal history from backend:', e)
        }
      },

      setRewardsEnabled: (enabled: boolean) => {
        set({ rewardsEnabled: enabled })
      },

      resetGameProgress: () => {
        set({
          achievements: INITIAL_ACHIEVEMENTS.map((a: Achievement) => ({
            ...a,
            unlocked: false,
            unlockedAt: undefined,
          })),
          points: 0,
          recentUnlock: null,
          historyChecked: [],
          pairTracking: new Map(),
          commitCount: 0,
          prMergedCount: 0,
          terminalCommandCount: 0,
        })
      },
    }),
    {
      name: 'git-manager-game-store',
      // Convert sets to arrays for localstorage JSON serialization
      partialize: (state: GameState) => ({
        achievements: state.achievements,
        points: state.points,
        historyChecked: state.historyChecked,
        rewardsEnabled: state.rewardsEnabled,
        commitCount: state.commitCount,
        prMergedCount: state.prMergedCount,
        terminalCommandCount: state.terminalCommandCount,
      }),
      merge: (persistedState: unknown, currentState: GameState): GameState => {
        const persisted = (persistedState ?? {}) as Partial<GameState>
        const merged: GameState = { ...currentState, ...persisted }
        if (persisted.achievements) {
          merged.achievements = INITIAL_ACHIEVEMENTS.map((staticAch) => {
            const saved = persisted.achievements?.find((a) => a.id === staticAch.id)
            return {
              ...staticAch,
              unlocked: saved ? saved.unlocked : false,
              unlockedAt: saved ? saved.unlockedAt : undefined,
            }
          })
        }
        return merged
      },
    }
  )
)

// Automatically wire the store to the appEventBus event channel on import
appEventBus.subscribe((event: AppEvent, payload?: unknown) => {
  useGameStore.getState().processAppEvent(event, payload)
})
