import { Trophy, Lock } from 'lucide-react'
import { Progress } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { achievementI18nKey } from '../../../lib/rewards/achievementI18n'
import { TROPHY_COLORS } from '../lib/rewardVisuals.config'
import type { Achievement } from '../../../lib/rewards/types'

interface AchievementCardProps {
  achievement: Achievement
  /** The one this achievement is gated behind, if any — `undefined` when it has no prerequisite. */
  prerequisite?: Achievement
  /** Live counters for the "fil rouge" milestones, so a locked one can show how far along it is. */
  milestoneProgress: Record<string, number>
}

/**
 * One challenge on the trophy board.
 *
 * Two things are hidden rather than shown, and both are the point of the board rather than a
 * detail of it: an achievement whose prerequisite is still locked shows `???` and names only what
 * has to be unlocked first, and a cosmetic reward keeps its name secret until it is earned.
 * Spelling either out early is what turns a board of surprises into a checklist.
 */
export function AchievementCard({
  achievement: item,
  prerequisite,
  milestoneProgress,
}: AchievementCardProps) {
  const { t, i18n } = useTranslation('launchpad')
  const isPrereqLocked = item.prerequisiteId ? !prerequisite?.unlocked : false

  const displayTitle = isPrereqLocked ? '???' : t(achievementI18nKey(item.id, 'title'))
  const displayDesc = isPrereqLocked
    ? t('rewards.mysteryChallenge', {
        title: prerequisite
          ? t(achievementI18nKey(prerequisite.id, 'title'))
          : t('rewards.prerequisiteFallback'),
      })
    : t(achievementI18nKey(item.id, 'description'))
  const displayReward =
    !item.unlocked && item.rewardIsCosmetic ? '???' : t(achievementI18nKey(item.id, 'reward'))

  const showMilestone = item.milestoneType && !item.unlocked && !isPrereqLocked
  const currentProgress = item.milestoneType ? (milestoneProgress[item.milestoneType] ?? 0) : 0

  return (
    <div
      data-testid={`achievement-card-${item.id}`}
      className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${
        item.unlocked
          ? 'border-border/80 bg-card/30 shadow-xs'
          : 'border-border/30 bg-card/10 opacity-70'
      } ${isPrereqLocked ? 'bg-black/5 opacity-40' : ''}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${TROPHY_COLORS[item.type]}`}
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
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/80">{displayDesc}</p>

        {showMilestone && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-[9px] font-semibold text-muted-foreground">
              <span className="rounded bg-primary/10 px-1 text-[8px] tracking-wider text-primary uppercase">
                {t('rewards.filRouge')}
              </span>
              <span>
                {currentProgress} / {item.milestoneValue}
              </span>
            </div>
            <Progress
              value={Math.min(100, (currentProgress / (item.milestoneValue || 1)) * 100)}
              className="border border-border/20 bg-black/25"
              indicatorClassName="bg-primary/70 duration-300"
              aria-hidden
            />
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span
            className={`text-[9px] font-bold ${item.unlocked ? 'text-primary' : 'text-primary/70'}`}
          >
            {t('rewards.gain')} {displayReward}
          </span>
          {item.unlockedAt && (
            <span className="text-[8px] text-muted-foreground/60">
              {t('rewards.obtainedOn')}{' '}
              {new Date(item.unlockedAt).toLocaleDateString(i18n.language)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
