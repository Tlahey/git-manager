import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('../../../api/ai.api', () => ({ aiStatusService: { check: vi.fn() } }))

import { aiStatusService } from '../../../api/ai.api'
import { AiSection } from './AiSection'
import { useSettingsStore } from '../../../stores/settings.store'

const mockedCheck = aiStatusService.check as unknown as ReturnType<typeof vi.fn>
const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('AiSection — provider preset', () => {
  it('lists every preset once opened, disabling the ones not implemented yet', async () => {
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByTestId('ai-provider-select'))
    expect(screen.getByTestId('ai-provider-option-ollama')).toHaveAttribute('aria-disabled', 'false')
    expect(screen.getByTestId('ai-provider-option-anthropic')).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('filters the provider list via the search bar', async () => {
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByTestId('ai-provider-select'))
    await user.type(screen.getByTestId('ai-provider-search'), 'anthro')
    expect(screen.getByTestId('ai-provider-option-anthropic')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-provider-option-ollama')).not.toBeInTheDocument()
  })

  it('selecting a preset resets the URL to its default and clears the connection status', async () => {
    mockedCheck.mockResolvedValue({ connected: true, models: [] })
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.ai.test'))
    await screen.findByTestId('ai-connection-status')

    // Move the URL away from Ollama's default first, so re-selecting "ollama" — the only
    // implemented preset today, since the searchable list (unlike the old native <select>) can't
    // reach a disabled option through real UI interaction — is observably a reset, not a no-op.
    fireEvent.change(screen.getByDisplayValue('http://localhost:11434'), {
      target: { value: 'http://localhost:9999' },
    })

    await user.click(screen.getByTestId('ai-provider-select'))
    await user.click(screen.getByTestId('ai-provider-option-ollama'))

    expect(useSettingsStore.getState().settings.ai.url).toBe('http://localhost:11434')
    expect(screen.queryByTestId('ai-connection-status')).not.toBeInTheDocument()
  })
})

describe('AiSection — connection test', () => {
  it('tests the connection and shows a connected message with the model count', async () => {
    mockedCheck.mockResolvedValue({ connected: true, models: ['llama3.2', 'mistral'] })
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.ai.test'))
    // The status service (mocked here) resolves preset→protocol internally; the component just
    // hands it the current connection settings.
    expect(mockedCheck).toHaveBeenCalledWith(useSettingsStore.getState().settings.ai)
    expect(await screen.findByText('settings.ai.connected:{"count":2}')).toBeInTheDocument()
  })

  it('shows a disconnected message when not connected', async () => {
    mockedCheck.mockResolvedValue({ connected: false, models: [] })
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.ai.test'))
    expect(await screen.findByText('settings.ai.disconnected')).toBeInTheDocument()
  })

  it('treats a thrown error as disconnected', async () => {
    mockedCheck.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.ai.test'))
    expect(await screen.findByText('settings.ai.disconnected')).toBeInTheDocument()
  })

  it('switches to a model dropdown listing the detected models once connected', async () => {
    mockedCheck.mockResolvedValue({ connected: true, models: ['llama3.2', 'mistral'] })
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.ai.test'))
    await screen.findByText('settings.ai.connected:{"count":2}')
    const select = screen.getByTestId('ai-model-select')
    expect(select).toBeInTheDocument()
    await user.selectOptions(select, 'mistral')
    expect(useSettingsStore.getState().settings.ai.model).toBe('mistral')
  })
})

describe('AiSection — fields', () => {
  it('binds the request timeout', async () => {
    const user = userEvent.setup()
    render(<AiSection />)
    const timeoutInput = screen.getByDisplayValue('30')
    await user.clear(timeoutInput)
    await user.type(timeoutInput, '60')
    expect(useSettingsStore.getState().settings.ai.timeoutSeconds).toBe(60)
  })

  it('does not expose feature tuning (temperature / system prompt / scope toggles)', () => {
    render(<AiSection />)
    // These are owned per-feature inside @git-manager/ai and must never surface in Settings.
    expect(screen.queryByText('settings.ai.temperature')).not.toBeInTheDocument()
    expect(screen.queryByText('settings.llm.systemPrompt')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows an API key field only for presets that require one', async () => {
    render(<AiSection />)
    expect(screen.queryByTestId('ai-api-key-input')).not.toBeInTheDocument()
    // "openai" isn't selectable via the UI yet (disabled, see the preset-listing test above) —
    // AiSection subscribes to the whole settings store, so setting it directly exercises the
    // field's conditional rendering, same reasoning as the preset-switch test above.
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, ai: { ...state.settings.ai, preset: 'openai' } },
    }))
    expect(await screen.findByTestId('ai-api-key-input')).toBeInTheDocument()
  })
})
