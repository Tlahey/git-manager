import { useTranslation } from '@git-manager/i18n'
import { Input, Textarea } from '@git-manager/ui'
import { OverriddenBadge } from './OverriddenBadge'
import { useSettingsStore } from '../../../stores/settings.store'

/**
 * AI-commit settings: the commit-style guidance and subject pattern the AI commit features follow
 * (on top of any commitlint config and the repo's own history). Split out of the General section
 * into its own AI-scoped page, shown only when AI is enabled.
 */
export function AiCommitSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useSettingsStore()
  const git = settings.git

  function updateGit(partial: Partial<typeof git>) {
    updateSettings({ git: { ...git, ...partial } })
  }

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold text-foreground">{t('settings.git.commitStyle')}</h4>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-foreground">
            {t('settings.git.commitInstructions')}
          </label>
          <OverriddenBadge field="commitInstructions" />
        </div>
        <Textarea
          data-testid="commit-instructions-input"
          value={git.commitInstructions ?? ''}
          onChange={(e) => updateGit({ commitInstructions: e.target.value })}
          placeholder={t('settings.git.commitInstructionsPlaceholder')}
          rows={3}
          className="resize-none text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          {t('settings.git.commitInstructionsHint')}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-foreground">
            {t('settings.git.commitPattern')}
          </label>
          <OverriddenBadge field="commitPattern" />
        </div>
        <Input
          data-testid="commit-pattern-input"
          value={git.commitPattern ?? ''}
          onChange={(e) => updateGit({ commitPattern: e.target.value })}
          placeholder="^(feat|fix|chore)(\\(.+\\))?: .+"
          className="h-8 font-mono text-xs"
        />
        <p className="text-[10px] text-muted-foreground">{t('settings.git.commitPatternHint')}</p>
      </div>
    </div>
  )
}
