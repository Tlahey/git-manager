import { Sparkles } from 'lucide-react'
import { useTranslation } from '@git-manager/i18n'
import { Tooltip } from '@git-manager/ui'
import { getAiPreset } from '@git-manager/ai'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiStatusStore, type AiConnectionState } from '../../stores/aiStatus.store'

interface AiStatusIndicatorProps {
  /** Opens Settings › AI, so a failing provider is one click from being fixed. */
  onOpenSettings: () => void
}

/** Per-state colouring of the footer pill. `unknown` shares the muted `checking` look — both mean
 * "nothing conclusive yet", and the startup check makes `unknown` very short-lived. */
const STATE_CLASSES: Record<AiConnectionState, string> = {
  unknown: 'text-muted-foreground/60',
  checking: 'text-muted-foreground/60',
  connected: 'text-emerald-500',
  disconnected: 'text-tone-warning',
}

/** i18n keys (namespace `common`) for each state's short label and its tooltip. */
const STATE_LABEL_KEYS: Record<AiConnectionState, string> = {
  unknown: 'aiStatus.unknown',
  checking: 'aiStatus.checking',
  connected: 'aiStatus.connected',
  disconnected: 'aiStatus.disconnected',
}

/**
 * Footer pill reporting whether the configured AI provider answered its last liveness check (run at
 * startup by `useAiStatusCheck`, re-run by the Settings validate button). Hidden entirely when AI
 * features are turned off, so users who don't want AI never see AI chrome.
 */
export function AiStatusIndicator({ onOpenSettings }: AiStatusIndicatorProps) {
  const { t } = useTranslation('common')
  const aiEnabled = useSettingsStore((s) => s.settings.ai.enabled !== false)
  const preset = useSettingsStore((s) => s.settings.ai.preset)
  const model = useSettingsStore((s) => s.settings.ai.model)
  const state = useAiStatusStore((s) => s.state)

  if (!aiEnabled) return null

  const providerLabel = getAiPreset(preset).label
  const tooltip =
    state === 'connected'
      ? t('aiStatus.tooltipConnected', { provider: providerLabel, model })
      : t('aiStatus.tooltipOther', {
          provider: providerLabel,
          state: t(STATE_LABEL_KEYS[state]),
        })

  return (
    <Tooltip content={tooltip}>
      <button
        onClick={onOpenSettings}
        aria-label={tooltip}
        data-testid="footer-ai-status"
        data-state={state}
        className="flex cursor-pointer items-center gap-1.5 rounded border border-transparent px-2 py-0.5 transition-all duration-150 hover:border-border hover:bg-accent"
      >
        <Sparkles className={`h-3.5 w-3.5 ${STATE_CLASSES[state]}`} />
        <span className={`hidden sm:inline ${STATE_CLASSES[state]}`}>
          {state === 'connected' ? model : t(STATE_LABEL_KEYS[state])}
        </span>
      </button>
    </Tooltip>
  )
}
