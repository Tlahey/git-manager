import { useTranslation } from '@git-manager/i18n'
import { Trophy, Trash2 } from 'lucide-react'
import { useGameStore } from '../../../stores/game.store'

export function RewardsSection() {
  const { t } = useTranslation('settings')
  const { rewardsEnabled, setRewardsEnabled, resetGameProgress } = useGameStore()

  const handleReset = () => {
    if (confirm(t('settings.rewards.resetConfirm'))) {
      resetGameProgress()
    }
  }

  return (
    <div className="space-y-6" data-testid="rewards-settings-section">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Trophy className="h-4 w-4 text-amber-500" /> {t('settings.rewards.title')}
        </h3>
        <p className="text-[11px] text-muted-foreground">{t('settings.rewards.description')}</p>
      </div>

      <div className="h-px bg-border" />

      {/* Activation Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card/25 p-4 shadow-sm">
        <div className="max-w-[80%] space-y-0.5">
          <label
            className="cursor-pointer text-xs font-semibold text-foreground"
            htmlFor="toggle-rewards"
          >
            {t('settings.rewards.enable')}
          </label>
          <p className="text-[10px] text-muted-foreground">{t('settings.rewards.enableHint')}</p>
        </div>
        <input
          type="checkbox"
          id="toggle-rewards"
          data-testid="rewards-toggle"
          checked={rewardsEnabled}
          onChange={(e) => setRewardsEnabled(e.target.checked)}
          className="h-4 w-4 cursor-pointer rounded border-border text-primary accent-primary focus:ring-primary"
        />
      </div>

      {/* Control Actions / Reset */}
      <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-destructive">
            {t('settings.rewards.controlZone')}
          </h4>
          <p className="text-[10px] text-muted-foreground">
            {t('settings.rewards.controlZoneHint')}
          </p>
        </div>
        <button
          onClick={handleReset}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-destructive/30 px-3 text-xs text-destructive/80 transition-colors hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('settings.rewards.reset')}
        </button>
      </div>
    </div>
  )
}
