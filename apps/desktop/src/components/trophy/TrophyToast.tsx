import { useEffect, useState } from 'react'
import { Trophy, X } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { useGameStore, type Achievement } from '../../stores/game.store'
import { apiSendNativeNotification } from '../../api/notification.api'
import { achievementI18nKey } from '../../lib/rewards/achievementI18n'

export function TrophyToast() {
  const { t } = useTranslation('launchpad')
  const { recentUnlock, clearRecentUnlock } = useGameStore()
  const [activeUnlock, setActiveUnlock] = useState<Achievement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (recentUnlock) {
      setActiveUnlock(recentUnlock)
      setVisible(true)

      // Mirror the toast as an OS banner; clicking it opens the Rewards tab, where the trophy is.
      void apiSendNativeNotification({
        title: t('rewards.toast.nativeTitle', { tier: t(`rewards.${recentUnlock.type}`) }),
        body: t('rewards.toast.nativeBody', {
          title: t(achievementI18nKey(recentUnlock.id, 'title')),
          description: t(achievementI18nKey(recentUnlock.id, 'description')),
          reward: t(achievementI18nKey(recentUnlock.id, 'reward')),
        }),
        route: { kind: 'rewards' },
      })

      // Hide the visual toast after 4.5 seconds
      const timer = setTimeout(() => {
        setVisible(false)
        // Let transition finish before resetting state
        setTimeout(() => {
          clearRecentUnlock()
          setActiveUnlock(null)
        }, 300)
      }, 4500)

      return () => clearTimeout(timer)
    }
  }, [recentUnlock, clearRecentUnlock, t])

  if (!activeUnlock) return null

  const typeColors = {
    bronze: {
      border: 'border-[#cd7f32]/40',
      bg: 'bg-[#cd7f32]/10',
      icon: 'text-[#cd7f32]',
      shadow: 'shadow-[#cd7f32]/20',
    },
    silver: {
      border: 'border-[#c0c0c0]/40',
      bg: 'bg-[#c0c0c0]/10',
      icon: 'text-[#e2e8f0]',
      shadow: 'shadow-[#c0c0c0]/20',
    },
    gold: {
      border: 'border-[#ffd700]/40',
      bg: 'bg-[#ffd700]/10',
      icon: 'text-[#ffd700]',
      shadow: 'shadow-[#ffd700]/20',
    },
    platinum: {
      border: 'border-[#00ffff]/40',
      bg: 'bg-[#00ffff]/10',
      icon: 'text-[#00ffff]',
      shadow: 'shadow-[#00ffff]/20',
    },
  }[activeUnlock.type]

  return (
    <div
      data-testid="trophy-toast"
      className={`fixed bottom-16 right-4 z-overlay flex max-w-sm items-center gap-3 rounded-xl border ${typeColors.border} ${typeColors.bg} p-4 text-foreground shadow-lg backdrop-blur-md transition-all duration-300 ${typeColors.shadow} ${
        visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0'
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/30">
        <Trophy className={`h-6 w-6 ${typeColors.icon} animate-bounce`} />
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            🏆 {t('rewards.toast.badge', { tier: t(`rewards.${activeUnlock.type}`) })}
          </span>
          <span className="rounded bg-black/40 px-1 text-[9px] font-medium text-muted-foreground">
            +{activeUnlock.points} XP
          </span>
        </div>
        <h4 className="text-xs font-bold text-foreground">
          {t(achievementI18nKey(activeUnlock.id, 'title'))}
        </h4>
        <p className="mt-0.5 text-[10px] leading-normal text-muted-foreground">
          {t(achievementI18nKey(activeUnlock.id, 'description'))}
        </p>
        <p className="mt-1 text-[9px] font-semibold text-green-400">
          {t('rewards.gain')} {t(achievementI18nKey(activeUnlock.id, 'reward'))}
        </p>
      </div>

      <button
        onClick={() => setVisible(false)}
        className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-black/10 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
