import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../api/ai.api', () => ({
  aiStatusService: { check: vi.fn(), probe: vi.fn() },
}))

import { aiStatusService } from '../../../api/ai.api'
import { AiProviderForm } from './AiProviderForm'
import { useSettingsStore } from '../../../stores/settings.store'
import { useAiStatusStore } from '../../../stores/aiStatus.store'

const mockedCheck = aiStatusService.check as unknown as ReturnType<typeof vi.fn>
const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_STATUS = useAiStatusStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  mockedCheck.mockResolvedValue({ connected: false, models: [] })
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useAiStatusStore.setState(INITIAL_STATUS, true)
})

/** Puts the form in the "already checked, nothing found" state so the mount-time auto-check is a
 * no-op and a test can drive the validate button explicitly. */
function seedChecked() {
  useAiStatusStore.setState({ state: 'disconnected', models: [], lastCheckedAt: Date.now() })
}

describe('AiProviderForm — provider preset', () => {
  it('offers exactly Ollama and the generic OpenAI-compatible entry', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)
    await user.click(screen.getByTestId('ai-provider-select'))

    expect(screen.getByTestId('ai-provider-option-ollama')).toBeInTheDocument()
    expect(screen.getByTestId('ai-provider-option-openai-compatible')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-provider-option-lmstudio')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ai-provider-option-anthropic')).not.toBeInTheDocument()
  })

  it('describes the selected preset', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)
    expect(
      screen.getByText('Local Ollama server. Pick one of the models you have pulled.')
    ).toBeInTheDocument()

    await user.click(screen.getByTestId('ai-provider-select'))
    await user.click(screen.getByTestId('ai-provider-option-openai-compatible'))
    expect(await screen.findByText(/Any server speaking the OpenAI API/)).toBeInTheDocument()
  })

  it('switching preset moves the URL to its default and re-runs the check', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)

    await user.click(screen.getByTestId('ai-provider-select'))
    await user.click(screen.getByTestId('ai-provider-option-openai-compatible'))

    expect(useSettingsStore.getState().settings.ai.url).toBe('http://localhost:1234/v1')
    await waitFor(() =>
      expect(mockedCheck).toHaveBeenCalledWith(
        expect.objectContaining({ preset: 'openai-compatible', url: 'http://localhost:1234/v1' })
      )
    )
  })
})

describe('AiProviderForm — URL validation', () => {
  it('auto-checks on mount when nothing has been checked yet', async () => {
    render(<AiProviderForm />)
    await waitFor(() => expect(mockedCheck).toHaveBeenCalledOnce())
    expect(mockedCheck).toHaveBeenCalledWith(useSettingsStore.getState().settings.ai)
  })

  it('reports the model count when the provider answers', async () => {
    seedChecked()
    mockedCheck.mockResolvedValue({ connected: true, models: ['llama3.2', 'mistral'] })
    const user = userEvent.setup()
    render(<AiProviderForm />)
    await user.click(screen.getByTestId('ai-test-connection-button'))

    expect(await screen.findByTestId('ai-connection-status')).toHaveTextContent(
      'Connected (2 models)'
    )
  })

  it('reports a connected provider that lists no model', async () => {
    seedChecked()
    mockedCheck.mockResolvedValue({ connected: true, models: [] })
    const user = userEvent.setup()
    render(<AiProviderForm />)
    await user.click(screen.getByTestId('ai-test-connection-button'))

    expect(await screen.findByTestId('ai-connection-status')).toHaveTextContent(
      'Connected, but the provider lists no model.'
    )
  })

  it('shows the probed URL and HTTP status, not just "not connected"', async () => {
    seedChecked()
    mockedCheck.mockResolvedValue({
      connected: false,
      models: [],
      detail: 'GET http://localhost:8000/v1/models → HTTP 404',
    })
    const user = userEvent.setup()
    render(<AiProviderForm />)
    await user.click(screen.getByTestId('ai-test-connection-button'))

    expect(await screen.findByTestId('ai-connection-detail')).toHaveTextContent(
      'GET http://localhost:8000/v1/models → HTTP 404'
    )
  })

  it('shows no diagnostic line once the provider answers', async () => {
    seedChecked()
    mockedCheck.mockResolvedValue({ connected: true, models: ['llama3.2'] })
    const user = userEvent.setup()
    render(<AiProviderForm />)
    await user.click(screen.getByTestId('ai-test-connection-button'))

    await screen.findByTestId('ai-connection-status')
    expect(screen.queryByTestId('ai-connection-detail')).not.toBeInTheDocument()
  })

  it('treats a thrown error as not connected', async () => {
    seedChecked()
    mockedCheck.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<AiProviderForm />)
    await user.click(screen.getByTestId('ai-test-connection-button'))

    expect(await screen.findByTestId('ai-connection-status')).toHaveTextContent('Not connected')
  })

  it('validates the URL as currently typed, not the value the page mounted with', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)

    const url = screen.getByTestId('ai-url-input')
    await user.clear(url)
    await user.type(url, 'http://localhost:9999')
    await user.click(screen.getByTestId('ai-test-connection-button'))

    await waitFor(() =>
      expect(mockedCheck).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'http://localhost:9999' })
      )
    )
  })
})

describe('AiProviderForm — model & API key', () => {
  it('lists the models returned by the provider in a dropdown', async () => {
    useAiStatusStore.setState({
      state: 'connected',
      models: ['llama3.2', 'mistral'],
      lastCheckedAt: Date.now(),
    })
    const user = userEvent.setup()
    render(<AiProviderForm />)

    const select = screen.getByTestId('ai-model-select')
    await user.selectOptions(select, 'mistral')
    expect(useSettingsStore.getState().settings.ai.model).toBe('mistral')
  })

  it('keeps a persisted model selectable even when the provider no longer serves it', () => {
    useAiStatusStore.setState({
      state: 'connected',
      models: ['mistral'],
      lastCheckedAt: Date.now(),
    })
    render(<AiProviderForm />)

    // The default settings pin llama3.2, which isn't in the list above.
    expect(screen.getByTestId('ai-model-select')).toHaveValue('llama3.2')
  })

  it('falls back to a free-text model field when no model could be listed', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)

    const input = screen.getByTestId('ai-model-input')
    await user.clear(input)
    await user.type(input, 'qwen2.5-coder')
    expect(useSettingsStore.getState().settings.ai.model).toBe('qwen2.5-coder')
  })

  it('offers an API key only on the generic preset, and drops it when leaving that preset', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)
    expect(screen.queryByTestId('ai-api-key-input')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('ai-provider-select'))
    await user.click(screen.getByTestId('ai-provider-option-openai-compatible'))
    const keyInput = await screen.findByTestId('ai-api-key-input')
    await user.type(keyInput, 'sk-test')
    expect(useSettingsStore.getState().settings.ai.apiKey).toBe('sk-test')

    await user.click(screen.getByTestId('ai-provider-select'))
    await user.click(screen.getByTestId('ai-provider-option-ollama'))
    expect(screen.queryByTestId('ai-api-key-input')).not.toBeInTheDocument()
    expect(useSettingsStore.getState().settings.ai.apiKey).toBeUndefined()
  })

  it('binds the request timeout', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)
    const timeoutInput = screen.getByDisplayValue('30')
    await user.clear(timeoutInput)
    await user.type(timeoutInput, '60')
    expect(useSettingsStore.getState().settings.ai.timeoutSeconds).toBe(60)
  })
})
