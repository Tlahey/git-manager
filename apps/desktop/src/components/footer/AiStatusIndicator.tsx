import { useTranslation } from '@git-manager/i18n'
import { Spinner, Tooltip, LlmIcon } from '@git-manager/ui'
import { getAiPreset } from '@git-manager/ai'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiStatusStore, type AiConnectionState } from '../../stores/aiStatus.store'
import { useAiActivityStore, type AiRunOrigin } from '../../stores/aiActivity.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

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
  'summary-commit-message': 'aiStatus.work.commitMessage',
  'summary-pr-description': 'aiStatus.work.prDescription',
  'change-explanation': 'aiStatus.work.changeExplanation',
  // One feature covers the branch, commit and working-tree explanations (it discriminates on its
  // input's scope), so they share one label rather than three that cannot be told apart here.
  'summary-explanation': 'aiStatus.work.summaryExplanation',
  'commit-recompose': 'aiStatus.work.commitRecompose',
  'code-review': 'aiStatus.work.codeReview',
  'summary-grouping': 'aiStatus.work.fileGrouping',
  'daily-summary': 'aiStatus.work.dailySummary',
  'summary-search': 'aiStatus.work.summarySearch',
  // The map phases, which is where the minutes go: naming them is what makes a long wait legible
  // rather than alarming.
  'file-summary': 'aiStatus.work.fileSummary',
  'commit-relevance': 'aiStatus.work.commitRelevance',
  'commit-search-answer': 'aiStatus.work.commitSearchAnswer',
}

/**
 * Takes the user to the generation that is running: its repository tab, then the panel it came from.
 *
 * The panel is restored *and* the centre slot's other claimants are cleared, the same handoff the AI
 * menu performs — otherwise the panel reopens behind whatever diff the user has since opened, which
 * would make the pill look broken precisely when it is doing its job.
 */
function goToRun(origin: AiRunOrigin) {
  const ui = useRepoUIStore.getState()
  if (ui.activeTab !== origin.repoPath) ui.setActiveTab(origin.repoPath)
  if (origin.panel) {
    ui.setActiveDiffFile(null)
    ui.setActivePrNumber(null)
    ui.setAiPanelTarget(origin.panel)
  }
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
  const fastModel = useSettingsStore((s) => s.settings.ai.fastModel)
  const state = useAiStatusStore((s) => s.state)
  const runs = useAiActivityStore((s) => s.runs)
  const progress = useAiActivityStore((s) => s.progress)

  if (!aiEnabled) return null

  // The newest run wins when several overlap: it is the one the user just triggered, so it is the
  // one they are waiting on.
  const activeRun = runs.length > 0 ? runs[runs.length - 1] : null
  const providerLabel = getAiPreset(preset).label

  // Both slots in one clause, on hover only. The pill used to print the model name, which stopped
  // working the day a setup could name two: neither one alone is the answer to "what is configured",
  // and the pair does not fit a footer. What the pill is *for* — is it up, is it busy — never needed
  // the name anyway.
  const models = fastModel
    ? t('aiStatus.modelPair', { model, fastModel })
    : t('aiStatus.modelSingle', { model })

  if (activeRun) {
    const labelKey = FEATURE_LABEL_KEYS[activeRun.featureId]
    const label = labelKey ? t(labelKey) : t('aiStatus.working')
    const origin = activeRun.origin
    // Only the feature the count belongs to, and only when there is more than one step: a streaming
    // feature has no steps to report, and "1/1" is noise.
    const steps =
      progress && progress.featureId === activeRun.featureId && progress.total > 1
        ? `${progress.completed}/${progress.total}`
        : null

    return (
      <Pill
        // A busy pill promises a different thing from an idle one, so it must say so: clicking takes
        // you to the work, not to Settings. Only when the run has nowhere to return to does it keep
        // the old promise.
        tooltip={
          origin
            ? t('aiStatus.tooltipGoToWork', { provider: providerLabel, models, task: label })
            : t('aiStatus.tooltipWorking', { provider: providerLabel, models, task: label })
        }
        state="working"
        onClick={origin ? () => goToRun(origin) : onOpenSettings}
        icon={<Spinner className="h-3.5 w-3.5 text-primary" data-testid="footer-ai-spinner" />}
        label={label}
        labelClassName="text-primary"
        steps={steps}
      />
    )
  }

  return (
    <Pill
      tooltip={
        state === 'connected'
          ? t('aiStatus.tooltipConnected', { provider: providerLabel, models })
          : t('aiStatus.tooltipOther', {
              provider: providerLabel,
              state: t(STATE_LABEL_KEYS[state]),
            })
      }
      state={state}
      onClick={onOpenSettings}
      icon={<LlmIcon className={`h-3.5 w-3.5 ${STATE_CLASSES[state]}`} />}
      label={t(STATE_LABEL_KEYS[state])}
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
  onClick,
  icon,
  label,
  labelClassName,
  steps,
}: {
  tooltip: string
  state: AiConnectionState | 'working'
  onClick: () => void
  icon: React.ReactNode
  label: string
  labelClassName: string
  /** `7/42` while a map phase runs, else null. */
  steps?: string | null
}) {
  return (
    <Tooltip content={tooltip}>
      <button
        onClick={onClick}
        aria-label={tooltip}
        data-testid="footer-ai-status"
        data-state={state}
        className="flex cursor-pointer items-center gap-1.5 rounded border border-transparent px-2 py-0.5 transition-all duration-150 hover:border-border hover:bg-accent"
      >
        {icon}
        <span className={`hidden sm:inline ${labelClassName}`}>{label}</span>
        {/* Kept when the label folds away, unlike the label itself: on a narrow footer a spinner
            alone says "something is happening", while "7/42" says it is getting somewhere. */}
        {steps && (
          <span className="font-mono tabular-nums text-primary" data-testid="footer-ai-steps">
            {steps}
          </span>
        )}
      </button>
    </Tooltip>
  )
}
