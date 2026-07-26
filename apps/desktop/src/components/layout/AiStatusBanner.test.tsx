import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiStatusBanner } from './AiStatusBanner'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiStatusStore } from '../../stores/aiStatus.store'
import { renderWithLanguage } from '../../test/i18n'

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_STATUS = useAiStatusStore.getState()

function setStatus(state: 'unknown' | 'checking' | 'connected' | 'disconnected') {
  act(() => useAiStatusStore.setState({ state }))
}

function setAiEnabled(enabled: boolean) {
  const { settings, updateSettings } = useSettingsStore.getState()
  act(() => updateSettings({ ai: { ...settings.ai, enabled } }))
}

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useAiStatusStore.setState(INITIAL_STATUS, true)
})

describe('AiStatusBanner', () => {
  it('stays out of the way while the provider is reachable', () => {
    setStatus('connected')
    render(<AiStatusBanner onOpenSettings={vi.fn()} />)
    expect(screen.queryByTestId('ai-status-banner')).not.toBeInTheDocument()
  })

  it.each(['unknown', 'checking'] as const)('renders nothing in the %s state', (state) => {
    render(<AiStatusBanner onOpenSettings={vi.fn()} />)
    setStatus(state)
    expect(screen.queryByTestId('ai-status-banner')).not.toBeInTheDocument()
  })

  it('warns with the provider name and URL once the check fails', () => {
    render(<AiStatusBanner onOpenSettings={vi.fn()} />)
    setStatus('disconnected')

    const banner = screen.getByTestId('ai-status-banner')
    expect(banner).toHaveTextContent('Ollama is unreachable')
    expect(banner).toHaveTextContent('http://localhost:11434')
  })

  it('opens the AI settings when the message is clicked', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<AiStatusBanner onOpenSettings={onOpenSettings} />)
    setStatus('disconnected')

    await user.click(screen.getByTestId('ai-status-banner-open-settings'))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('never shows up when AI features are disabled', () => {
    setAiEnabled(false)
    render(<AiStatusBanner onOpenSettings={vi.fn()} />)
    setStatus('disconnected')
    expect(screen.queryByTestId('ai-status-banner')).not.toBeInTheDocument()
  })

  it('can be dismissed, and re-arms once the provider comes back', async () => {
    const user = userEvent.setup()
    render(<AiStatusBanner onOpenSettings={vi.fn()} />)
    setStatus('disconnected')

    await user.click(screen.getByTestId('ai-status-banner-dismiss'))
    expect(screen.queryByTestId('ai-status-banner')).not.toBeInTheDocument()

    // A later outage is reported again rather than staying silenced for the session.
    setStatus('connected')
    setStatus('disconnected')
    expect(screen.getByTestId('ai-status-banner')).toBeInTheDocument()
  })

  it('is translated', () => {
    useAiStatusStore.setState({ state: 'disconnected' })
    renderWithLanguage(<AiStatusBanner onOpenSettings={vi.fn()} />, 'fr')
    expect(screen.getByTestId('ai-status-banner')).toHaveTextContent('Ollama est injoignable')
  })
})
