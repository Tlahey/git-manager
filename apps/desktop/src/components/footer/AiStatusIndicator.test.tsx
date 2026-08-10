import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiStatusIndicator } from './AiStatusIndicator'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiStatusStore } from '../../stores/aiStatus.store'
import { useAiActivityStore, type AiRunOrigin } from '../../stores/aiActivity.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_STATUS = useAiStatusStore.getState()

function setStatus(state: 'unknown' | 'checking' | 'connected' | 'disconnected') {
  act(() => useAiStatusStore.setState({ state }))
}

function startRun(featureId: string, origin?: AiRunOrigin) {
  let runId = 0
  act(() => {
    runId = useAiActivityStore.getState().begin(featureId, origin)
  })
  return runId
}

function setPhaseProgress(
  featureId: string,
  completed: number,
  total: number,
  owner = 'commit-search-answer'
) {
  act(() => useAiActivityStore.getState().setProgress({ featureId, owner, completed, total }))
}

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useAiStatusStore.setState(INITIAL_STATUS, true)
  useAiActivityStore.setState({ runs: [], progress: null })
})

describe('AiStatusIndicator', () => {
  /**
   * The pill used to print the model name. That stopped working the day a setup could name two:
   * neither one alone answers "what is configured", and the pair does not fit a footer. What the
   * pill is *for* — is it up, is it busy — never needed the name.
   */
  it('reports the connection rather than the model name', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')

    const pill = screen.getByTestId('footer-ai-status')
    expect(pill).toHaveAttribute('data-state', 'connected')
    expect(pill).toHaveTextContent('Connected')
    expect(pill).not.toHaveTextContent('llama3.2')
  })

  // The tooltip is stacked — the sentence, then one line per model — and the accessible name is
  // those same lines joined by a space. Asserting the joined form is what checks both at once:
  // a line dropped from the stack disappears from the name too.
  it('names the model on hover, and both of them on their own lines when a fast one is set', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    expect(screen.getByTestId('footer-ai-status')).toHaveAccessibleName(
      /Ollama connected\. Click to open the AI settings\. model llama3\.2/
    )

    const { settings, updateSettings } = useSettingsStore.getState()
    act(() => updateSettings({ ai: { ...settings.ai, fastModel: 'qwen3:8b' } }))

    // No comma between them any more: they are two lines, not one clause.
    expect(screen.getByTestId('footer-ai-status')).toHaveAccessibleName(
      /model llama3\.2 fast model qwen3:8b/
    )
  })

  it('reports an unreachable provider', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('disconnected')

    const pill = screen.getByTestId('footer-ai-status')
    expect(pill).toHaveTextContent('Offline')
    expect(pill).toHaveAccessibleName(/Ollama — Offline/)
  })

  it('reports the in-flight check', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('checking')
    expect(screen.getByTestId('footer-ai-status')).toHaveTextContent('Checking…')
  })

  it('opens the AI settings when clicked', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<AiStatusIndicator onOpenSettings={onOpenSettings} />)

    await user.click(screen.getByTestId('footer-ai-status'))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('spins with the task name while the model is generating', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    startRun('summary-pr-description')

    const pill = screen.getByTestId('footer-ai-status')
    expect(pill).toHaveAttribute('data-state', 'working')
    expect(screen.getByTestId('footer-ai-spinner')).toBeInTheDocument()
    expect(pill).toHaveTextContent('Writing the PR description…')
    expect(pill).toHaveAccessibleName(
      /Ollama is working — Writing the PR description…\. model llama3\.2/
    )
  })

  it('goes back to the connection state once the run ends', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    const runId = startRun('summary-commit-message')
    expect(screen.getByTestId('footer-ai-spinner')).toBeInTheDocument()

    act(() => useAiActivityStore.getState().end(runId))
    expect(screen.queryByTestId('footer-ai-spinner')).not.toBeInTheDocument()
    expect(screen.getByTestId('footer-ai-status')).toHaveTextContent('Connected')
  })

  it('shows the newest task when two run at once', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    startRun('daily-summary')
    startRun('summary-explanation')

    expect(screen.getByTestId('footer-ai-status')).toHaveTextContent('Explaining the changes…')
  })

  it('still spins for a feature with no label of its own', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    startRun('some-future-feature')

    expect(screen.getByTestId('footer-ai-spinner')).toBeInTheDocument()
    expect(screen.getByTestId('footer-ai-status')).toHaveTextContent('Working…')
  })

  it('takes precedence over a stale disconnected state', () => {
    // The liveness check can still say "offline" while a generation is visibly running; the
    // evidence in front of us wins.
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('disconnected')
    startRun('summary-commit-message')

    expect(screen.getByTestId('footer-ai-status')).toHaveAttribute('data-state', 'working')
  })

  /**
   * The pill is often the only sign a run exists at all — the panel that started it may be behind a
   * diff, another tab, or nothing the user can find again. Clicking it has to lead back there.
   */
  it('goes to the panel running the model, not to Settings', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    useRepoUIStore.setState({
      activeTab: '/other-repo',
      activeDiffFile: { path: 'src/a.ts', staged: false },
      activePrNumber: 12,
      aiPanelTarget: null,
    })

    render(<AiStatusIndicator onOpenSettings={onOpenSettings} />)
    setStatus('connected')
    startRun('commit-relevance', { repoPath: '/repo', panel: { kind: 'search' } })

    await user.click(screen.getByTestId('footer-ai-status'))

    const ui = useRepoUIStore.getState()
    expect(ui.activeTab).toBe('/repo')
    expect(ui.aiPanelTarget).toEqual({ kind: 'search' })
    // The centre slot is cleared too, or the panel reopens behind the diff that was showing.
    expect(ui.activeDiffFile).toBeNull()
    expect(ui.activePrNumber).toBeNull()
    expect(onOpenSettings).not.toHaveBeenCalled()
  })

  it('says so in the tooltip, since a busy pill now promises something else', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    startRun('commit-relevance', { repoPath: '/repo', panel: { kind: 'search' } })

    expect(screen.getByTestId('footer-ai-status')).toHaveAccessibleName(/Click to go to it/)
  })

  it('falls back to Settings for a run with nowhere to return to', async () => {
    // The morning briefing runs before any tab is chosen, so it has no origin.
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<AiStatusIndicator onOpenSettings={onOpenSettings} />)
    setStatus('connected')
    startRun('daily-summary')

    await user.click(screen.getByTestId('footer-ai-status'))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('names the phase that takes the minutes when nothing claims it', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    startRun('commit-relevance')
    expect(screen.getByTestId('footer-ai-status')).toHaveTextContent(
      'Reading the commits one by one…'
    )
  })

  /**
   * A map phase is one small call per file, and it is where the minutes go — so naming the call left
   * a summary, a commit message and a briefing all announcing themselves as "Reading the files one
   * by one…", with nothing saying which button had been pressed. The count beside it is what says
   * how far the reading has got.
   */
  it('names the action a map phase is running for, and counts its files', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    startRun('file-summary')
    setPhaseProgress('file-summary', 3, 12, 'summary-explanation')

    expect(screen.getByTestId('footer-ai-status')).toHaveTextContent('Explaining the changes…')
    expect(screen.getByTestId('footer-ai-steps')).toHaveTextContent('3/12')
  })

  /**
   * The map phases are where the minutes go — one call per file, per commit — and a spinner alone
   * cannot distinguish "reading commit 3 of 60" from "stuck on the first one".
   */
  it('counts the steps of a map phase', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    startRun('commit-relevance')
    setPhaseProgress('commit-relevance', 7, 42)

    expect(screen.getByTestId('footer-ai-steps')).toHaveTextContent('7/42')
  })

  it('counts nothing for a feature that has no steps', () => {
    // A streamed answer is one call. "1/1" is noise, and the map phase's leftover count would be a
    // lie — which is why the count is tagged with the feature it belongs to.
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    setPhaseProgress('commit-relevance', 42, 42)
    startRun('commit-search-answer')

    expect(screen.queryByTestId('footer-ai-steps')).not.toBeInTheDocument()
  })

  it('counts nothing while the provider is idle', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    setPhaseProgress('file-summary', 3, 9)

    expect(screen.queryByTestId('footer-ai-steps')).not.toBeInTheDocument()
  })

  it('renders no AI chrome at all when AI features are disabled', () => {
    const { settings, updateSettings } = useSettingsStore.getState()
    updateSettings({ ai: { ...settings.ai, enabled: false } })

    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    expect(screen.queryByTestId('footer-ai-status')).not.toBeInTheDocument()
  })
})
