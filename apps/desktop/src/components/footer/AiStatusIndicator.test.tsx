import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiStatusIndicator } from './AiStatusIndicator'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiStatusStore } from '../../stores/aiStatus.store'
import { useAiActivityStore } from '../../stores/aiActivity.store'

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_STATUS = useAiStatusStore.getState()

function setStatus(state: 'unknown' | 'checking' | 'connected' | 'disconnected') {
  act(() => useAiStatusStore.setState({ state }))
}

function startRun(featureId: string) {
  let runId = 0
  act(() => {
    runId = useAiActivityStore.getState().begin(featureId)
  })
  return runId
}

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useAiStatusStore.setState(INITIAL_STATUS, true)
  useAiActivityStore.setState({ runs: [] })
})

describe('AiStatusIndicator', () => {
  it('shows the model in use once the provider answered', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')

    const pill = screen.getByTestId('footer-ai-status')
    expect(pill).toHaveAttribute('data-state', 'connected')
    expect(pill).toHaveTextContent('llama3.2')
    expect(pill).toHaveAccessibleName(/Ollama connected — model llama3\.2/)
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
    startRun('pr-description')

    const pill = screen.getByTestId('footer-ai-status')
    expect(pill).toHaveAttribute('data-state', 'working')
    expect(screen.getByTestId('footer-ai-spinner')).toBeInTheDocument()
    expect(pill).toHaveTextContent('Writing the PR description…')
    expect(pill).toHaveAccessibleName(/Ollama is working — Writing the PR description… \(llama3\.2\)/)
  })

  it('goes back to the connection state once the run ends', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    const runId = startRun('commit-message')
    expect(screen.getByTestId('footer-ai-spinner')).toBeInTheDocument()

    act(() => useAiActivityStore.getState().end(runId))
    expect(screen.queryByTestId('footer-ai-spinner')).not.toBeInTheDocument()
    expect(screen.getByTestId('footer-ai-status')).toHaveTextContent('llama3.2')
  })

  it('shows the newest task when two run at once', () => {
    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    setStatus('connected')
    startRun('daily-summary')
    startRun('branch-explanation')

    expect(screen.getByTestId('footer-ai-status')).toHaveTextContent('Explaining the branch…')
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
    startRun('commit-message')

    expect(screen.getByTestId('footer-ai-status')).toHaveAttribute('data-state', 'working')
  })

  it('renders no AI chrome at all when AI features are disabled', () => {
    const { settings, updateSettings } = useSettingsStore.getState()
    updateSettings({ ai: { ...settings.ai, enabled: false } })

    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    expect(screen.queryByTestId('footer-ai-status')).not.toBeInTheDocument()
  })
})
