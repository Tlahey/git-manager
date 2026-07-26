import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Alert } from '@git-manager/ui'
import { getAiPreset } from '@git-manager/ai'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiStatusStore } from '../../stores/aiStatus.store'

interface AiStatusBannerProps {
  /** Opens Settings on the AI page — the whole message area is the affordance for it. */
  onOpenSettings: () => void
}

/**
 * Full-width warning strip shown under the tab bar when AI features are enabled but the configured
 * provider answered nothing on startup (see `useAiStatusCheck`). Clicking it lands on Settings › AI,
 * where the URL can be fixed and re-validated.
 *
 * Renders `null` in every other state, so it costs no layout when the provider is healthy.
 */
export function AiStatusBanner({ onOpenSettings }: AiStatusBannerProps) {
  const { t } = useTranslation('common')
  const aiEnabled = useSettingsStore((s) => s.settings.ai.enabled !== false)
  const preset = useSettingsStore((s) => s.settings.ai.preset)
  const url = useSettingsStore((s) => s.settings.ai.url)
  const state = useAiStatusStore((s) => s.state)
  const [dismissed, setDismissed] = useState(false)

  // A dismissal only silences the current outage: reconnecting (or disabling AI) arms the banner
  // again, so a later failure is reported rather than swallowed for the rest of the session.
  useEffect(() => {
    if (state !== 'disconnected') setDismissed(false)
  }, [state])

  if (!aiEnabled || state !== 'disconnected' || dismissed) return null

  return (
    <Alert
      variant="warning"
      role="alert"
      data-testid="ai-status-banner"
      className="shrink-0 items-center gap-2 rounded-none border-x-0 border-t-0 px-4 py-1.5"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          data-testid="ai-status-banner-open-settings"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left underline-offset-2 hover:underline"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="font-medium">
            {t('aiStatus.disconnectedTitle', { provider: getAiPreset(preset).label })}
          </span>
          <span className="min-w-0 truncate opacity-80">{t('aiStatus.disconnectedHint', { url })}</span>
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('aiStatus.dismiss')}
          data-testid="ai-status-banner-dismiss"
          className="shrink-0 cursor-pointer rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </Alert>
  )
}
