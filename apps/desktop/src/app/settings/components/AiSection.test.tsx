import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))
vi.mock('../../../api/ai.api', () => ({ apiCheckAiStatus: vi.fn() }))

import { apiCheckAiStatus } from '../../../api/ai.api'
import { AiSection } from './AiSection'
import { useSettingsStore } from '../../../stores/settings.store'

const mockedCheckStatus = apiCheckAiStatus as unknown as ReturnType<typeof vi.fn>
const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('AiSection — provider preset', () => {
  it('lists every preset, disabling the ones not implemented yet', () => {
    render(<AiSection />)
    const select = screen.getByTestId('ai-provider-select')
    const options = Array.from(select.querySelectorAll('option'))
    const ollama = options.find((o) => o.value === 'ollama')!
    const anthropic = options.find((o) => o.value === 'anthropic')!
    expect(ollama.disabled).toBe(false)
    expect(anthropic.disabled).toBe(true)
  })

  it('selecting a preset updates the URL to its default and clears the connection status', async () => {
    mockedCheckStatus.mockResolvedValue({ connected: true, models: [] })
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.ai.test'))
    await screen.findByTestId('ai-connection-status')

    // "lmstudio" is a real, valid preset — just not yet implemented (disabled in the dropdown, see
    // the test above), so userEvent.selectOptions (which respects that, like a real browser) can't
    // reach it. fireEvent dispatches the change event directly, exercising handlePresetChange's own
    // logic independent of which presets happen to be selectable today.
    fireEvent.change(screen.getByTestId('ai-provider-select'), { target: { value: 'lmstudio' } })
    expect(useSettingsStore.getState().settings.ai.url).toBe('http://localhost:1234')
    expect(screen.queryByTestId('ai-connection-status')).not.toBeInTheDocument()
  })
})

describe('AiSection — connection test', () => {
  it('tests the connection and shows a connected message with the model count', async () => {
    mockedCheckStatus.mockResolvedValue({ connected: true, models: ['llama3.2', 'mistral'] })
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.ai.test'))
    expect(mockedCheckStatus).toHaveBeenCalledWith({
      protocol: 'openai-compatible',
      url: 'http://localhost:11434',
      apiKey: undefined,
    })
    expect(await screen.findByText('settings.ai.connected:{"count":2}')).toBeInTheDocument()
  })

  it('shows a disconnected message when not connected', async () => {
    mockedCheckStatus.mockResolvedValue({ connected: false, models: [] })
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.ai.test'))
    expect(await screen.findByText('settings.ai.disconnected')).toBeInTheDocument()
  })

  it('treats a thrown error as disconnected', async () => {
    mockedCheckStatus.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.ai.test'))
    expect(await screen.findByText('settings.ai.disconnected')).toBeInTheDocument()
  })

  it('switches to a model dropdown listing the detected models once connected', async () => {
    mockedCheckStatus.mockResolvedValue({ connected: true, models: ['llama3.2', 'mistral'] })
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
  it('binds temperature and timeout', async () => {
    const user = userEvent.setup()
    render(<AiSection />)
    const temperatureInput = screen.getByDisplayValue('0.3')
    await user.clear(temperatureInput)
    await user.type(temperatureInput, '0.7')
    expect(useSettingsStore.getState().settings.ai.temperature).toBe(0.7)

    const timeoutInput = screen.getByDisplayValue('30')
    await user.clear(timeoutInput)
    await user.type(timeoutInput, '60')
    expect(useSettingsStore.getState().settings.ai.timeoutSeconds).toBe(60)
  })

  it('toggles includeRepoContext and autoDetectScope', async () => {
    const user = userEvent.setup()
    render(<AiSection />)
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[0])
    expect(useSettingsStore.getState().settings.ai.includeRepoContext).toBe(false)
    await user.click(checkboxes[1])
    expect(useSettingsStore.getState().settings.ai.autoDetectScope).toBe(false)
  })

  it('shows an API key field only for presets that require one', () => {
    render(<AiSection />)
    expect(screen.queryByTestId('ai-api-key-input')).not.toBeInTheDocument()
    // "openai" isn't selectable via the UI yet (disabled, see the preset-listing test above) —
    // fireEvent exercises the field's conditional rendering directly, same reasoning as the
    // preset-switch test above.
    fireEvent.change(screen.getByTestId('ai-provider-select'), { target: { value: 'openai' } })
    expect(screen.getByTestId('ai-api-key-input')).toBeInTheDocument()
  })
})

describe('AiSection — system prompt', () => {
  it('is collapsed by default and expands on click', async () => {
    const user = userEvent.setup()
    render(<AiSection />)
    // url + model inputs both have role "textbox"; the system-prompt textarea is a 3rd once expanded.
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    await user.click(screen.getByText('settings.llm.systemPrompt'))
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
  })

  it('resets the prompt via the reset button', async () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        ai: { ...INITIAL_SETTINGS.settings.ai, systemPrompt: 'custom prompt' },
      },
    })
    const user = userEvent.setup()
    render(<AiSection />)
    await user.click(screen.getByText('settings.llm.systemPrompt'))
    expect(screen.getByDisplayValue('custom prompt')).toBeInTheDocument()
    await user.click(screen.getByText('settings.llm.resetPrompt'))
    expect(useSettingsStore.getState().settings.ai.systemPrompt).toBe('')
  })
})
