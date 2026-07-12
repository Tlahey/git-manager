import { useEffect, useState } from 'react'
import { Trophy, CheckCircle2, Lock } from 'lucide-react'
import { useGameStore, getLevelInfo } from '../../../stores/game.store'

type StatusFilter = 'all' | 'in_progress' | 'completed'

export function RewardsTab() {
  const {
    achievements,
    points,
    checkTerminalHistory,
    commitCount,
    prMergedCount,
    terminalCommandCount,
  } = useGameStore()
  const [filter, setFilter] = useState<StatusFilter>('all')

  // Polling zsh/bash terminal history every 4 seconds when the rewards board is viewable
  useEffect(() => {
    // Initial check
    checkTerminalHistory()

    const interval = setInterval(() => {
      checkTerminalHistory()
    }, 4000)

    return () => clearInterval(interval)
  }, [checkTerminalHistory])

  // Count trophies by type
  const unlocked = achievements.filter((a) => a.unlocked)
  const bronzeCount = achievements.filter((a) => a.type === 'bronze' && a.unlocked).length
  const silverCount = achievements.filter((a) => a.type === 'silver' && a.unlocked).length
  const goldCount = achievements.filter((a) => a.type === 'gold' && a.unlocked).length
  const platinumCount = achievements.filter((a) => a.type === 'platinum' && a.unlocked).length
  const totalCount = achievements.length

  const isPlatinumUnlocked = achievements.find((a) => a.id === 'platinum_trophy')?.unlocked || false
  const { level, name, min, max, frameClass } = getLevelInfo(points, isPlatinumUnlocked)

  const progressPercent = Math.min(100, Math.max(0, ((points - min) / (max - min)) * 100))

  // Visual class/badge styling based on level
  const rankGlow = isPlatinumUnlocked
    ? 'shadow-cyan-500/20 border-cyan-500/30 text-cyan-400'
    : {
        1: 'shadow-slate-500/10 border-slate-500/20 text-slate-400',
        2: 'shadow-[#cd7f32]/10 border-[#cd7f32]/20 text-[#cd7f32]',
        3: 'shadow-[#c0c0c0]/15 border-[#c0c0c0]/20 text-[#e2e8f0]',
        4: 'shadow-[#ffd700]/20 border-[#ffd700]/30 text-[#ffd700]',
        5: 'shadow-[#ff007f]/30 border-[#ff007f]/30 text-[#ff007f] animate-pulse',
      }[level as 1 | 2 | 3 | 4 | 5]

  // Difficulties grouping metadata
  const difficulties = [
    {
      id: 'beginner',
      label: 'Niveau Débutant',
      colorClass: 'text-foreground border-border bg-card/30',
    },
    {
      id: 'intermediate',
      label: 'Niveau Intermédiaire',
      colorClass: 'text-foreground border-border bg-card/30',
    },
    {
      id: 'expert',
      label: 'Niveau Expert',
      colorClass: 'text-foreground border-border bg-card/30',
    },
  ] as const

  return (
    <div
      className="flex h-full flex-col space-y-6 overflow-y-auto bg-background/30 p-5"
      data-testid="rewards-tab-container"
    >
      {/* Top dashboard row: rank details & PlayStation-like trophy counts */}
      <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-3">
        {/* Tier rank card */}
        <div
          className={`flex flex-col gap-3 rounded-xl border bg-card/40 p-4 shadow-md backdrop-blur-sm ${rankGlow}`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/20 ${frameClass} p-1`}
            >
              <Trophy className="h-7 w-7" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Rang Git Actuel
              </span>
              <h2 className="max-w-[180px] truncate text-sm font-extrabold tracking-wide">
                {name}
              </h2>
            </div>
          </div>
          <div className="mt-1">
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
              <span>Niveau {level}</span>
              <span>
                {points} / {max} XP
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Trophy Cabinet stats */}
        <div className="col-span-1 flex flex-col justify-between rounded-xl border border-border bg-card/40 p-4 shadow-md backdrop-blur-sm md:col-span-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Cabinet de Trophées
            </span>
            <div className="mt-3 flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-1.5">
                <Trophy className="h-5.5 w-5.5 text-[#cd7f32] drop-shadow-[0_2px_4px_rgba(205,127,50,0.3)]" />
                <div>
                  <div className="text-xs font-extrabold text-foreground">{bronzeCount}</div>
                  <div className="text-[8px] font-semibold uppercase text-muted-foreground">
                    Bronze
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Trophy className="h-5.5 w-5.5 text-[#e2e8f0] drop-shadow-[0_2px_4px_rgba(192,192,192,0.3)]" />
                <div>
                  <div className="text-xs font-extrabold text-foreground">{silverCount}</div>
                  <div className="text-[8px] font-semibold uppercase text-muted-foreground">
                    Argent
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Trophy className="h-5.5 w-5.5 text-[#ffd700] drop-shadow-[0_2px_4px_rgba(255,215,0,0.3)]" />
                <div>
                  <div className="text-xs font-extrabold text-foreground">{goldCount}</div>
                  <div className="text-[8px] font-semibold uppercase text-muted-foreground">Or</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Trophy className="h-5.5 w-5.5 text-[#00ffff] drop-shadow-[0_2px_4px_rgba(0,255,255,0.3)]" />
                <div>
                  <div className="text-xs font-extrabold text-foreground">{platinumCount}</div>
                  <div className="text-[8px] font-semibold uppercase text-muted-foreground">
                    Platine
                  </div>
                </div>
              </div>
              <div className="hidden h-6 w-px bg-border/50 sm:block" />
              <div>
                <div className="text-xs font-extrabold text-foreground">
                  {unlocked.length}{' '}
                  <span className="text-[10px] text-muted-foreground">/ {totalCount}</span>
                </div>
                <div className="text-[8px] font-semibold uppercase text-muted-foreground">
                  Succès Complétés
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/80">
            <CheckCircle2 className="h-3 w-3 text-green-400" />
            Les récompenses se débloquent automatiquement en arrière-plan.
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border pb-3">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Trophy className="h-3.5 w-3.5 text-primary" /> Liste des Défis
        </h3>
        <div className="flex gap-1.5">
          {(
            [
              { id: 'all', label: 'Tous' },
              { id: 'in_progress', label: 'En cours' },
              { id: 'completed', label: 'Terminés' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-[10px] font-semibold transition-all ${
                filter === opt.id
                  ? 'border-primary bg-primary font-bold text-primary-foreground shadow-sm'
                  : 'border-border bg-card/30 text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped achievements listing */}
      <div className="space-y-8">
        {difficulties.map((diff) => {
          // Filter achievements belonging to this difficulty group and matching current status filter
          const groupAchievements = achievements.filter((a) => {
            if (a.difficulty !== diff.id) return false
            if (filter === 'in_progress') return !a.unlocked
            if (filter === 'completed') return a.unlocked
            return true
          })

          if (groupAchievements.length === 0) return null

          const groupTotal = achievements.filter((a) => a.difficulty === diff.id).length
          const groupUnlocked = achievements.filter(
            (a) => a.difficulty === diff.id && a.unlocked
          ).length

          return (
            <div key={diff.id} className="space-y-4">
              <div
                className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs font-bold ${diff.colorClass}`}
              >
                <span>{diff.label}</span>
                <span className="rounded bg-black/15 px-2 py-0.5 text-[10px] font-normal">
                  {groupUnlocked} / {groupTotal} Complétés
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {groupAchievements.map((item) => {
                  const isPrereqLocked = item.prerequisiteId
                    ? !achievements.find((a) => a.id === item.prerequisiteId)?.unlocked
                    : false

                  // Conceal details if prerequisite is locked
                  const displayTitle = isPrereqLocked ? '???' : item.title
                  const displayDesc = isPrereqLocked
                    ? `Défi mystère. Débloquez d'abord le succès "${
                        achievements.find((a) => a.id === item.prerequisiteId)?.title || 'prérequis'
                      }" pour le révéler.`
                    : item.description

                  // Cosmetic rewards: hide reward name behind ??? until unlocked
                  const hasCosmetic =
                    item.rewardDescription && item.rewardDescription !== "Amélioration d'XP"
                  const displayReward =
                    !item.unlocked && hasCosmetic ? '???' : item.rewardDescription

                  const trophyColors = {
                    bronze: 'text-[#cd7f32] bg-[#cd7f32]/10 border-[#cd7f32]/20',
                    silver: 'text-[#e2e8f0] bg-[#c0c0c0]/10 border-[#c0c0c0]/20',
                    gold: 'text-[#ffd700] bg-[#ffd700]/10 border-[#ffd700]/20',
                    platinum: 'text-[#00ffff] bg-[#00ffff]/10 border-[#00ffff]/20',
                  }[item.type]

                  return (
                    <div
                      key={item.id}
                      data-testid={`achievement-card-${item.id}`}
                      className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${
                        item.unlocked
                          ? 'border-border/80 bg-card/30 shadow-sm'
                          : 'border-border/30 bg-card/10 opacity-70'
                      } ${isPrereqLocked ? 'bg-black/5 opacity-40' : ''}`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${trophyColors}`}
                      >
                        {item.unlocked ? (
                          <Trophy className="h-4.5 w-4.5" />
                        ) : (
                          <Lock className="h-4 w-4 text-muted-foreground/60" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <h4
                            className={`truncate text-xs font-bold ${item.unlocked ? 'text-foreground' : 'text-muted-foreground'}`}
                          >
                            {displayTitle}
                          </h4>
                          <span className="shrink-0 rounded bg-black/20 px-1 text-[9px] font-semibold text-muted-foreground">
                            +{item.points} XP
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/80">
                          {displayDesc}
                        </p>

                        {/* Fil rouge progressive milestone progress bar */}
                        {item.milestoneType &&
                          !item.unlocked &&
                          !isPrereqLocked &&
                          (() => {
                            const currentProgress =
                              {
                                commit: commitCount,
                                pr_merged: prMergedCount,
                                terminal_command: terminalCommandCount,
                              }[item.milestoneType] ?? 0

                            return (
                              <div className="mt-2 space-y-1">
                                <div className="flex justify-between text-[9px] font-semibold text-muted-foreground">
                                  <span className="rounded bg-primary/10 px-1 text-[8px] uppercase tracking-wider text-primary">
                                    Fil Rouge
                                  </span>
                                  <span>
                                    {currentProgress} / {item.milestoneValue}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full border border-border/20 bg-black/25">
                                  <div
                                    className="h-full bg-primary/70 transition-all duration-300"
                                    style={{
                                      width: `${Math.min(100, (currentProgress / (item.milestoneValue || 1)) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })()}

                        <div className="mt-2 flex items-center justify-between">
                          <span
                            className={`text-[9px] font-bold ${item.unlocked ? 'text-primary' : 'text-primary/70'}`}
                          >
                            Gain : {displayReward}
                          </span>
                          {item.unlockedAt && (
                            <span className="text-[8px] text-muted-foreground/60">
                              Obtenu le {new Date(item.unlockedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
