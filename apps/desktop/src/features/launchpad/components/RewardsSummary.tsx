import { Trophy, CheckCircle2 } from 'lucide-react'
import { Card } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import { getLevelInfo } from '../../../stores/game.store'
import { rankGlowFor, TROPHY_TIERS } from '../lib/rewardVisuals.config'
import type { Achievement } from '../../../lib/rewards/types'

interface RewardsSummaryProps {
  achievements: Achievement[]
  points: number
}

/**
 * The two cards across the top of the trophy board: the current rank with its XP bar, and the
 * cabinet counting unlocked trophies per tier.
 *
 * Both are derived entirely from the achievement list and the point total — they hold no state of
 * their own, which is why they can sit beside the challenge list rather than inside it.
 */
export function RewardsSummary({ achievements, points }: RewardsSummaryProps) {
  const { t } = useTranslation('launchpad')

  const unlockedCount = achievements.filter((a) => a.unlocked).length
  const isPlatinumUnlocked = achievements.find((a) => a.id === 'platinum_trophy')?.unlocked ?? false
  const { level, rankId, min, max, frameClass } = getLevelInfo(points, isPlatinumUnlocked)
  const progressPercent = Math.min(100, Math.max(0, ((points - min) / (max - min)) * 100))

  return (
    <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-3">
      {/* Tier rank card — chrome-surface: this card is designed for a dark backdrop
          (bg-black/xx overlays, colored-on-dark rank glow), so on light themes like
          Twilight it opts into the dark nav-chrome palette instead of the light --card,
          keeping the rank subtitle and progress track legible. */}
      <div
        className={`chrome-surface flex flex-col gap-3 rounded-xl border bg-sidebar p-4 shadow-md backdrop-blur-xs ${rankGlowFor(level, isPlatinumUnlocked)}`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/20 ${frameClass} p-1`}
          >
            <Trophy className="h-7 w-7" />
          </div>
          <div>
            <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
              {t('rewards.currentRank')}
            </span>
            <h2 className="max-w-[180px] truncate text-sm font-extrabold tracking-wide">
              {t(`rewards.rank.${rankId}`)}
            </h2>
          </div>
        </div>
        <div className="mt-1">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
            <span>{t('rewards.level', { level })}</span>
            <span>
              {points} / {max} XP
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full bg-linear-to-r from-primary to-accent transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <Card className="col-span-1 flex flex-col justify-between rounded-xl bg-card/40 p-4 shadow-md backdrop-blur-xs md:col-span-2">
        <div>
          <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            {t('rewards.trophyCabinet')}
          </span>
          <div className="mt-3 flex flex-wrap items-center gap-4 sm:gap-6">
            {TROPHY_TIERS.map((tier) => (
              <div key={tier.type} className="flex items-center gap-1.5">
                <Trophy className={`h-5.5 w-5.5 ${tier.iconClassName}`} />
                <div>
                  <div className="text-xs font-extrabold text-foreground">
                    {achievements.filter((a) => a.type === tier.type && a.unlocked).length}
                  </div>
                  <div className="text-[8px] font-semibold text-muted-foreground uppercase">
                    {t(tier.labelKey)}
                  </div>
                </div>
              </div>
            ))}
            <div className="hidden h-6 w-px bg-border/50 sm:block" />
            <div>
              <div className="text-xs font-extrabold text-foreground">
                {unlockedCount}{' '}
                <span className="text-[10px] text-muted-foreground">/ {achievements.length}</span>
              </div>
              <div className="text-[8px] font-semibold text-muted-foreground uppercase">
                {t('rewards.achievementsCompleted')}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/80">
          <CheckCircle2 className="h-3 w-3 text-green-400" />
          {t('rewards.autoUnlock')}
        </div>
      </Card>
    </div>
  )
}
