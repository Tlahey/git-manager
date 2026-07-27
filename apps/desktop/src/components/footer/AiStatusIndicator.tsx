import { useTranslation } from '@git-manager/i18n'
import { Spinner, Tooltip, LlmIcon } from '@git-manager/ui'
import { getAiPreset } from '@git-manager/ai'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiStatusStore, type AiConnectionState } from '../../stores/aiStatus.store'
import { useAiActivityStore } from '../../stores/aiActivity.store'

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
 * What each running feature is called, keyed by its `AiFeature.id` from `@git-manager/ai`. A module
 * map can't call `t()`, so it holds keys and the component resolves them.
 *
 * A feature missing from this map still spins the indicator — it just falls back to the generic
 * "Working…" label rather than going unreported, which is the right way round for something whose
 * whole job is to prove the app hasn't frozen.
 */
const FEATURE_LABEL_KEYS: Record<string, string> = {
  'commit-message': 'aiStatus.work.commitMessage',
  'pr-description': 'aiStatus.work.prDescription',
  'change-explanation': 'aiStatus.work.changeExplanation',
  'branch-explanation': 'aiStatus.work.branchExplanation',
  'commit-explanation': 'aiStatus.work.commitExplanation',
  'commit-recompose': 'aiStatus.work.commitRecompose',
  'working-explanation': 'aiStatus.work.workingExplanation',
  'code-review': 'aiStatus.work.codeReview',
  'file-grouping': 'aiStatus.work.fileGrouping',
  'daily-summary': 'aiStatus.work.dailySummary',
}

/**
 * Footer pill reporting the configured AI provider: whether it answered its last liveness check (run
 * at startup by `useAiStatusCheck`, re-run by the Settings validate button), and — taking
 * precedence — whether the model is generating something right now.
 *
 * The busy state reuses this pill rather than adding a second indicator: there is one AI status in
 * the footer, and "a model is running" is the most urgent thing it can say. It matters because every
 * generation is somewhere the user isn't necessarily looking (a panel they scrolled past, a dialog
 * they closed, a daily summary that started itself), and a local model can take tens of seconds — a
 * silent app is indistinguishable from a frozen one.
 *
 * Hidden entirely when AI features are turned off, so users who don't want AI never see AI chrome.
 */
export function AiStatusIndicator({ onOpenSettings }: AiStatusIndicatorProps) {
  const { t } = useTranslation('common')
  const aiEnabled = useSettingsStore((s) => s.settings.ai.enabled !== false)
  const preset = useSettingsStore((s) => s.settings.ai.preset)
  const model = useSettingsStore((s) => s.settings.ai.model)
  const state = useAiStatusStore((s) => s.state)
  const runs = useAiActivityStore((s) => s.runs)

  if (!aiEnabled) return null

  // The newest run wins when several overlap: it is the one the user just triggered, so it is the
  // one they are waiting on.
  const activeRun = runs.length > 0 ? runs[runs.length - 1] : null
  const providerLabel = getAiPreset(preset).label

  if (activeRun) {
    const labelKey = FEATURE_LABEL_KEYS[activeRun.featureId]
    const label = labelKey ? t(labelKey) : t('aiStatus.working')

    return (
      <Pill
        tooltip={t('aiStatus.tooltipWorking', { provider: providerLabel, model, task: label })}
        state="working"
        onOpenSettings={onOpenSettings}
        icon={<Spinner className="h-3.5 w-3.5 text-primary" data-testid="footer-ai-spinner" />}
        label={label}
        labelClassName="text-primary"
      />
    )
  }

  return (
    <Pill
      tooltip={
        state === 'connected'
          ? t('aiStatus.tooltipConnected', { provider: providerLabel, model })
          : t('aiStatus.tooltipOther', {
              provider: providerLabel,
              state: t(STATE_LABEL_KEYS[state]),
            })
      }
      state={state}
      onOpenSettings={onOpenSettings}
      icon={<LlmIcon className={`h-3.5 w-3.5 ${STATE_CLASSES[state]}`} />}
      label={state === 'connected' ? model : t(STATE_LABEL_KEYS[state])}
      labelClassName={STATE_CLASSES[state]}
    />
  )
}

/** The footer pill's shell, shared by the busy and connection-state renderings so the two can never
 * drift apart. The label folds away on narrow footers; the tooltip always carries the full story,
 * and doubles as the accessible name. */
function Pill({
  tooltip,
  state,
  onOpenSettings,
  icon,
  label,
  labelClassName,
}: {
  tooltip: string
  state: AiConnectionState | 'working'
  onOpenSettings: () => void
  icon: React.ReactNode
  label: string
  labelClassName: string
}) {
  return (
    <Tooltip content={tooltip}>
      <button
        onClick={onOpenSettings}
        aria-label={tooltip}
        data-testid="footer-ai-status"
        data-state={state}
        className="flex cursor-pointer items-center gap-1.5 rounded border border-transparent px-2 py-0.5 transition-all duration-150 hover:border-border hover:bg-accent"
      >
        {icon}
        <span className={`hidden sm:inline ${labelClassName}`}>{label}</span>
      </button>
    </Tooltip>
  )
}
