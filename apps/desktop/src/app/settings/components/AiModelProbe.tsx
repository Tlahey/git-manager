import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import type { AiModelProbeResult } from '@git-manager/ai'
import { aiStatusService } from '../../../api/ai.api'
import { useSettingsStore } from '../../../stores/settings.store'
import { aiErrorMessage } from '../../../lib/aiErrorMessage'

/** Longest reply kept on screen — the probe asks for one word, but a chatty model may ignore that
 * and the settings page is not a transcript viewer. */
const MAX_REPLY_LENGTH = 120

/**
 * "Test the model" — the second half of validating an AI setup.
 *
 * The URL check next to it only proves the server lists models; it says nothing about the one that
 * is actually selected. This sends a real one-word completion to that model, which is what catches
 * a model that was never pulled, a name with a typo, or an auth layer that lets `/v1/models`
 * through but rejects generation.
 *
 * The result is deliberately local state: unlike the connection status, it is a one-off answer to a
 * question the user just asked, not something the banner or footer should keep reacting to.
 */
export function AiModelProbe() {
  const { t } = useTranslation('settings')
  const { t: tErrors } = useTranslation('errors')
  const model = useSettingsStore((s) => s.settings.ai.model)
  const [result, setResult] = useState<AiModelProbeResult | null>(null)
  const [isProbing, setIsProbing] = useState(false)

  async function handleProbe() {
    setIsProbing(true)
    setResult(null)
    try {
      // Read the connection fresh: the user may have just edited the URL or model above.
      setResult(await aiStatusService.probe(useSettingsStore.getState().settings.ai))
    } finally {
      setIsProbing(false)
    }
  }

  const reply = result?.reply.slice(0, MAX_REPLY_LENGTH) ?? ''
  const truncated = (result?.reply.length ?? 0) > MAX_REPLY_LENGTH

  return (
    <div className="space-y-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        onClick={handleProbe}
        disabled={isProbing || model.trim() === ''}
        data-testid="ai-probe-model-button"
      >
        {isProbing ? t('settings.ai.probing') : t('settings.ai.probeModel')}
      </Button>

      <p className="text-[10px] text-muted-foreground">
        {model.trim() === '' ? t('settings.ai.probeNoModel') : t('settings.ai.probeHint')}
      </p>

      {result && (
        <div role="status">
          <p
            data-testid="ai-probe-status"
            className={`text-xs ${result.ok ? 'text-tone-success' : 'text-tone-danger'}`}
          >
            {result.ok
              ? t('settings.ai.probeSuccess', { model, duration: result.durationMs })
              : t('settings.ai.probeFailed', { model })}
          </p>
          <p
            data-testid="ai-probe-detail"
            className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground"
          >
            {result.ok ? `${reply}${truncated ? '…' : ''}` : aiErrorMessage(result.error ?? '', tErrors)}
          </p>
        </div>
      )}
    </div>
  )
}
