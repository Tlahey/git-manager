import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import { gameObserver } from '../lib/gameObserver'
import JSON_ACHIEVEMENTS from './achievements.json'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Achievement {
  id: string
  title: string
  description: string
  points: number
  type: 'bronze' | 'silver' | 'gold' | 'platinum'
  difficulty: 'beginner' | 'intermediate' | 'expert'
  prerequisiteId?: string
  milestoneType?: 'commit' | 'pr_merged' | 'terminal_command'
  milestoneValue?: number
  commandKeyword?: string
  actionType?: string
  unlocked: boolean
  unlockedAt?: number
  rewardDescription: string
}

export interface GameState {
  achievements: Achievement[]
  points: number
  recentUnlock: Achievement | null
  historyChecked: string[] // List of terminal commands already processed
  stagedFilesHistory: Set<string> // Temporary session tracking for Stage & Unstage
  unstagedFilesHistory: Set<string>
  rewardsEnabled: boolean

  // Counters
  commitCount: number
  prMergedCount: number
  terminalCommandCount: number

  // Actions
  unlockAchievement: (id: string) => void
  clearRecentUnlock: () => void
  handleObserverEvent: (event: string, payload?: any) => void
  checkTerminalHistory: () => Promise<void>
  checkMilestones: (type: 'commit' | 'pr_merged' | 'terminal_command', value: number, rawCommand?: string) => void
  setRewardsEnabled: (enabled: boolean) => void
  resetGameProgress: () => void
}

const INITIAL_ACHIEVEMENTS: Achievement[] = (JSON_ACHIEVEMENTS as any[]).map((item) => ({
  ...item,
  unlocked: false,
  unlockedAt: undefined,
}))

// ─── Level Math ───────────────────────────────────────────────────────────────

export function getLevelInfo(points: number, isPlatinumUnlocked = false) {
  if (isPlatinumUnlocked) {
    return {
      level: 5,
      name: 'Git Grand Maître (Platine)',
      min: 300,
      max: 500,
      badge: 'Grand Maître',
      frameClass: 'avatar-frame-platinum',
    }
  }
  if (points < 50) {
    return { level: 1, name: 'Git Novice', min: 0, max: 50, badge: 'Novice', frameClass: '' }
  }
  if (points < 120) {
    return { level: 2, name: 'Git Apprenti', min: 50, max: 120, badge: 'Apprenti', frameClass: 'avatar-frame-bronze' }
  }
  if (points < 200) {
    return { level: 3, name: 'Git Praticien', min: 120, max: 200, badge: 'Praticien', frameClass: 'avatar-frame-silver' }
  }
  if (points < 300) {
    return { level: 4, name: 'Git Spécialiste', min: 200, max: 300, badge: 'Spécialiste', frameClass: 'avatar-frame-gold' }
  }
  return { level: 5, name: 'Git Grand Maître', min: 300, max: 500, badge: 'Grand Maître', frameClass: 'avatar-frame-neon' }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      achievements: INITIAL_ACHIEVEMENTS,
      points: 0,
      recentUnlock: null,
      historyChecked: [],
      stagedFilesHistory: new Set(),
      unstagedFilesHistory: new Set(),
      rewardsEnabled: true,

      commitCount: 0,
      prMergedCount: 0,
      terminalCommandCount: 0,

      unlockAchievement: (id: string) => {
        const list = get().achievements
        const item = list.find((a: Achievement) => a.id === id)
        if (!item || item.unlocked) return

        // Verify prerequisites are satisfied
        if (item.prerequisiteId) {
          const prereq = list.find((a: Achievement) => a.id === item.prerequisiteId)
          if (!prereq || !prereq.unlocked) return
        }

        const updated = list.map((a: Achievement) =>
          a.id === id ? { ...a, unlocked: true, unlockedAt: Date.now() } : a
        )

        set({
          achievements: updated,
          points: get().points + item.points,
          recentUnlock: { ...item, unlocked: true, unlockedAt: Date.now() },
        })

        // Check for Platinum Trophy: unlock it if all other 27 achievements are unlocked
        const allOtherUnlocked = updated.every((a: Achievement) => a.id === 'platinum_trophy' || a.unlocked)
        const plat = updated.find((a: Achievement) => a.id === 'platinum_trophy')
        if (allOtherUnlocked && plat && !plat.unlocked) {
          setTimeout(() => {
            get().unlockAchievement('platinum_trophy')
          }, 1000)
        }
      },

      clearRecentUnlock: () => {
        set({ recentUnlock: null })
      },

      checkMilestones: (type: 'commit' | 'pr_merged' | 'terminal_command', value: number, rawCommand?: string) => {
        const list = get().achievements
        list.forEach((ach: Achievement) => {
          if (ach.unlocked || ach.milestoneType !== type) return

          // Verify prerequisites are satisfied
          if (ach.prerequisiteId) {
            const prereq = list.find((a: Achievement) => a.id === ach.prerequisiteId)
            if (!prereq || !prereq.unlocked) return
          }

          if (type === 'terminal_command') {
            if (ach.commandKeyword && rawCommand && rawCommand.trim().toLowerCase().includes(ach.commandKeyword.toLowerCase())) {
              get().unlockAchievement(ach.id)
            }
          } else {
            if (ach.milestoneValue !== undefined && value >= ach.milestoneValue) {
              get().unlockAchievement(ach.id)
            }
          }
        })
      },

      handleObserverEvent: (event: string, payload?: any) => {
        if (!get().rewardsEnabled) return
        const { unlockAchievement, checkMilestones } = get()

        // 1. Direct actions mapping from achievements catalog
        const list = get().achievements
        list.forEach((ach: Achievement) => {
          if (ach.unlocked || !ach.actionType) return
          if (ach.actionType === event) {
            // Verify prerequisites are satisfied
            if (ach.prerequisiteId) {
              const prereq = list.find((a: Achievement) => a.id === ach.prerequisiteId)
              if (!prereq || !prereq.unlocked) return
            }
            unlockAchievement(ach.id)
          }
        })

        // Special observer notifications mapping
        if (event === 'open_app') {
          unlockAchievement('open_launchpad')
        }

        if (event === 'commit') {
          const nextVal = get().commitCount + 1
          set({ commitCount: nextVal })
          checkMilestones('commit', nextVal)
        }

        if (event === 'pr_closed_or_merged') {
          const nextVal = get().prMergedCount + 1
          set({ prMergedCount: nextVal })
          checkMilestones('pr_merged', nextVal)
        }

        if (event === 'terminal_command') {
          const cmd = payload?.command || ''
          const nextVal = get().terminalCommandCount + 1
          set({ terminalCommandCount: nextVal })
          checkMilestones('terminal_command', nextVal, cmd)
        }

        // 2. Stage/Unstage tracking
        if (event === 'stage') {
          const file = payload?.filePath || 'default'
          set((state: GameState) => {
            const next = new Set(state.stagedFilesHistory)
            next.add(file)
            return { stagedFilesHistory: next }
          })
        }
        if (event === 'unstage') {
          const file = payload?.filePath || 'default'
          const staged = get().stagedFilesHistory
          if (staged.has(file)) {
            unlockAchievement('stage_unstage')
          }
          set((state: GameState) => {
            const next = new Set(state.unstagedFilesHistory)
            next.add(file)
            return { unstagedFilesHistory: next }
          })
        }
      },

      checkTerminalHistory: async () => {
        if (!get().rewardsEnabled) return
        try {
          // Fetch zsh/bash history from Tauri backend
          const commands = await invoke<string[]>('get_terminal_commands')
          if (!commands || commands.length === 0) return

          const checked = get().historyChecked
          const newCommands = commands.filter((c) => !checked.includes(c))

          if (newCommands.length > 0) {
            // Update checking registry first to prevent concurrency loops
            set({ historyChecked: [...checked, ...newCommands] })

            // Dispatch each new command event to the observer
            newCommands.forEach((cmd) => {
              gameObserver.notify('terminal_command', { command: cmd })
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
          achievements: INITIAL_ACHIEVEMENTS.map((a: Achievement) => ({ ...a, unlocked: false, unlockedAt: undefined })),
          points: 0,
          recentUnlock: null,
          historyChecked: [],
          stagedFilesHistory: new Set(),
          unstagedFilesHistory: new Set(),
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
      merge: (persistedState: any, currentState: any) => {
        const merged = { ...currentState, ...persistedState }
        if (persistedState && persistedState.achievements) {
          merged.achievements = INITIAL_ACHIEVEMENTS.map((staticAch) => {
            const saved = persistedState.achievements.find((a: any) => a.id === staticAch.id)
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

// Automatically wire the store to the gameObserver event channel on import
gameObserver.subscribe((event: string, payload?: any) => {
  useGameStore.getState().handleObserverEvent(event, payload)
})
