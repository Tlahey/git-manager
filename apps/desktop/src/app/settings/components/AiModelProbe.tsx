import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import type { AiModelProbeResult } from '@git-manager/ai'
import { aiStatusService } from '../../../api/ai.api'
import { useSettingsStore } from '../../../stores/settings.store'
import { aiErrorMessage } from '../../../lib/aiErrorMessage'

/** Longest reply kept on screen — the probe asks for a tiny object, but a chatty model may ignore
 * that and the settings page is not a transcript viewer. */
const MAX_REPLY_LENGTH = 120

interface AiModelProbeProps {
  /** The fast model, when one is configured — tested by the same button, in the same run. */
  fastModel?: string
}

/** One model's outcome, paired with the model it belongs to. */
interface ProbeEntry {
  model: string
  /** Distinguishes the two result blocks' test ids, and nothing else. */
  slot: 'main' | 'fast'
  result: AiModelProbeResult
}

/**
 * "Test the models" — the second half of validating an AI setup.
 *
 * The URL check next to it only proves the server lists models; it says nothing about the ones that
 * are actually selected. This sends each of them a real, schema-constrained completion, which is
 * what catches a model that was never pulled, a name with a typo, an auth layer that lets
 * `/v1/models` through but rejects generation — and, separately, a model that answers fine while
 * ignoring the JSON format half the features depend on.
 *
 * One button for both slots rather than one each: they are configured side by side and a user
 * checking their setup wants the whole answer, not two clicks and two mental notes. The runs are
 * sequential, because a local provider serves one model at a time and two concurrent probes would
 * mostly measure each other.
 *
 * The result is deliberately local state: unlike the connection status, it is a one-off answer to a
 * question the user just asked, not something the banner or footer should keep reacting to.
 */
export function AiModelProbe({ fastModel }: AiModelProbeProps = {}) {
  const { t } = useTranslation('settings')
  const { t: tErrors } = useTranslation('errors')
  const model = useSettingsStore((s) => s.settings.ai.model)
  const [entries, setEntries] = useState<ProbeEntry[]>([])
  const [isProbing, setIsProbing] = useState(false)

  const fast = fastModel?.trim() ?? ''
  // Testing the same name twice would spend a model load to print the same line again.
  const probesFast = fast !== '' && fast !== model

  async function handleProbe() {
    setIsProbing(true)
    setEntries([])
    try {
      // Read the connection fresh: the user may have just edited the URL or a model above.
      const connection = useSettingsStore.getState().settings.ai
      const collected: ProbeEntry[] = [
        { model, slot: 'main', result: await aiStatusService.probe(connection) },
      ]
      if (probesFast) {
        collected.push({
          model: fast,
          slot: 'fast',
          result: await aiStatusService.probe(connection, fast),
        })
      }
      setEntries(collected)
    } finally {
      setIsProbing(false)
    }
  }

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
        {isProbing
          ? t('settings.ai.probing')
          : probesFast
            ? t('settings.ai.probeModels')
            : t('settings.ai.probeModel')}
      </Button>

      <p className="text-[10px] text-muted-foreground">
        {model.trim() === '' ? t('settings.ai.probeNoModel') : t('settings.ai.probeHint')}
      </p>

      {entries.map((entry) => (
        <ProbeResult key={entry.slot} entry={entry} t={t} tErrors={tErrors} />
      ))}
    </div>
  )
}

/** One model's verdict: reachable or not, what came back, and whether the format was honored. */
function ProbeResult({
  entry,
  t,
  tErrors,
}: {
  entry: ProbeEntry
  t: (key: string, params?: Record<string, unknown>) => string
  tErrors: (key: string, params?: Record<string, unknown>) => string
}) {
  const { model, slot, result } = entry
  const prefix = slot === 'main' ? 'ai-probe' : 'ai-probe-fast'
  const reply = result.reply.slice(0, MAX_REPLY_LENGTH)
  const truncated = result.reply.length > MAX_REPLY_LENGTH

  return (
    <div role="status">
      <p
        data-testid={`${prefix}-status`}
        className={`text-xs ${result.ok ? 'text-tone-success' : 'text-tone-danger'}`}
      >
        {result.ok
          ? t('settings.ai.probeSuccess', { model, duration: result.durationMs })
          : t('settings.ai.probeFailed', { model })}
      </p>
      <p
        data-testid={`${prefix}-detail`}
        className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground"
      >
        {result.ok
          ? `${reply}${truncated ? '…' : ''}`
          : aiErrorMessage(result.error ?? '', tErrors)}
      </p>
      {/* The state worth a warning: the round-trip works, so everything *looks* configured, and half
          the features will still fail on every call. It is invisible until one runs — for the
          history search, that is half an hour of scanning that comes back unreadable. */}
      {result.ok && !result.structured && (
        <p data-testid={`${prefix}-unstructured`} className="mt-1 text-[10px] text-tone-warning">
          {t('settings.ai.probeNoStructuredOutput', { model })}
        </p>
      )}
    </div>
  )
}
