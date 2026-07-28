import { useTranslation } from '@git-manager/i18n'
import { AiCommitSection } from './AiCommitSection'
import { AiDailySummarySettings } from './AiDailySummarySettings'
import { SettingsGroup } from './SettingsGroup'

/**
 * Everything the AI is asked to *do*, as opposed to how it is reached.
 *
 * The split it completes: the provider page answers "which model, where, within what limits", and
 * this one answers "what may it write, and in what style". They were interleaved — the daily
 * briefing toggles sat at the bottom of the connection form, while the commit guidance had a
 * top-level nav entry of its own — so neither page had a subject, and the nav read as two AI pages
 * with no rule saying which held what.
 *
 * Hidden entirely when AI is switched off (see `SettingsPage`): there is nothing here to configure
 * for a user who does not want AI, and a greyed-out page teaches them to stop looking.
 *
 * Feature *enablement and style* only. Instruction, temperature and prompt shape stay owned by each
 * feature inside `@git-manager/ai`, and are deliberately never surfaced in Settings.
 */
export function AiFeaturesSection() {
  const { t } = useTranslation('settings')

  return (
    <div className="space-y-5">
      <SettingsGroup
        title={t('settings.ai.groupCommitStyle')}
        description={t('settings.ai.groupCommitStyleHint')}
        divided={false}
        testId="ai-features-group-commit"
      >
        <AiCommitSection />
      </SettingsGroup>

      <SettingsGroup
        title={t('settings.ai.groupBriefing')}
        description={t('settings.ai.groupBriefingHint')}
        testId="ai-features-group-briefing"
      >
        <AiDailySummarySettings />
      </SettingsGroup>
    </div>
  )
}
