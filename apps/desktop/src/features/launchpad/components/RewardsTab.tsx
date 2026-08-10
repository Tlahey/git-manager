import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { Chip } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { useGameStore } from '../../../stores/game.store'
import { RewardsSummary } from './RewardsSummary'
import { AchievementCard } from './AchievementCard'
import { DIFFICULTY_GROUPS, DIFFICULTY_GROUP_CLASS } from '../lib/rewardVisuals.config'

type StatusFilter = 'all' | 'in_progress' | 'completed'

const STATUS_FILTERS: { id: StatusFilter; labelKey: string }[] = [
  { id: 'all', labelKey: 'rewards.filterAll' },
  { id: 'in_progress', labelKey: 'rewards.filterInProgress' },
  { id: 'completed', labelKey: 'rewards.filterCompleted' },
]

/** The trophy board: rank and cabinet on top, then every challenge grouped by difficulty. */
export function RewardsTab() {
  const { t } = useTranslation('launchpad')
  const {
    achievements,
    points,
    checkTerminalHistory,
    commitCount,
    prMergedCount,
    terminalCommandCount,
  } = useGameStore()
  const [filter, setFilter] = useState<StatusFilter>('all')

  // Terminal-driven achievements are the only ones nothing in the app can notify us about, so the
  // shell history is re-read while the board is on screen.
  useEffect(() => {
    checkTerminalHistory()
    const interval = setInterval(checkTerminalHistory, 4000)
    return () => clearInterval(interval)
  }, [checkTerminalHistory])

  const milestoneProgress = {
    commit: commitCount,
    pr_merged: prMergedCount,
    terminal_command: terminalCommandCount,
  }

  function matchesStatusFilter(unlocked: boolean): boolean {
    if (filter === 'in_progress') return !unlocked
    if (filter === 'completed') return unlocked
    return true
  }

  return (
    <div
      className="flex h-full flex-col space-y-6 overflow-y-auto bg-background/30 p-5"
      data-testid="rewards-tab-container"
    >
      <RewardsSummary achievements={achievements} points={points} />

      <div className="flex shrink-0 items-center justify-between border-b border-border pb-3">
        <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
          <Trophy className="h-3.5 w-3.5 text-primary" /> {t('rewards.challengeList')}
        </h3>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((opt) => (
            <Chip
              key={opt.id}
              active={filter === opt.id}
              onClick={() => setFilter(opt.id)}
              data-testid={`rewards-filter-${opt.id}`}
            >
              {t(opt.labelKey)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {DIFFICULTY_GROUPS.map((diff) => {
          const inGroup = achievements.filter((a) => a.difficulty === diff.id)
          const shown = inGroup.filter((a) => matchesStatusFilter(a.unlocked))
          // A group with nothing left after the filter disappears rather than showing an empty
          // heading — the counter in the heading counts the whole group, not the filtered view.
          if (shown.length === 0) return null

          return (
            <div key={diff.id} className="space-y-4">
              <div
                className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs font-bold ${DIFFICULTY_GROUP_CLASS}`}
              >
                <span>{t(diff.labelKey)}</span>
                <span className="rounded bg-black/15 px-2 py-0.5 text-[10px] font-normal">
                  {t('rewards.groupCompleted', {
                    unlocked: inGroup.filter((a) => a.unlocked).length,
                    total: inGroup.length,
                  })}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {shown.map((item) => (
                  <AchievementCard
                    key={item.id}
                    achievement={item}
                    prerequisite={
                      item.prerequisiteId
                        ? achievements.find((a) => a.id === item.prerequisiteId)
                        : undefined
                    }
                    milestoneProgress={milestoneProgress}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
