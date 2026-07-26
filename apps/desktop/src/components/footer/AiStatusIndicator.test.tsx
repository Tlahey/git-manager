import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiStatusIndicator } from './AiStatusIndicator'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiStatusStore } from '../../stores/aiStatus.store'

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_STATUS = useAiStatusStore.getState()

function setStatus(state: 'unknown' | 'checking' | 'connected' | 'disconnected') {
  act(() => useAiStatusStore.setState({ state }))
}

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useAiStatusStore.setState(INITIAL_STATUS, true)
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

  it('renders no AI chrome at all when AI features are disabled', () => {
    const { settings, updateSettings } = useSettingsStore.getState()
    updateSettings({ ai: { ...settings.ai, enabled: false } })

    render(<AiStatusIndicator onOpenSettings={vi.fn()} />)
    expect(screen.queryByTestId('footer-ai-status')).not.toBeInTheDocument()
  })
})
