import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))
vi.mock('../../../api/ollama.api', () => ({ apiCheckOllamaStatus: vi.fn() }))

import { apiCheckOllamaStatus } from '../../../api/ollama.api'
import { LlmSection } from './LlmSection'
import { useSettingsStore } from '../../../stores/settings.store'

const mockedCheckStatus = apiCheckOllamaStatus as unknown as ReturnType<typeof vi.fn>
const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('LlmSection — connection test', () => {
  it('tests the connection and shows a connected message with the model count', async () => {
    mockedCheckStatus.mockResolvedValue({ connected: true, models: ['llama3.2', 'mistral'] })
    const user = userEvent.setup()
    render(<LlmSection />)
    await user.click(screen.getByText('settings.ollama.test'))
    expect(mockedCheckStatus).toHaveBeenCalledWith('http://localhost:11434')
    expect(await screen.findByText('settings.ollama.connected:{"count":2}')).toBeInTheDocument()
  })

  it('shows a disconnected message when not connected', async () => {
    mockedCheckStatus.mockResolvedValue({ connected: false, models: [] })
    const user = userEvent.setup()
    render(<LlmSection />)
    await user.click(screen.getByText('settings.ollama.test'))
    expect(await screen.findByText('settings.ollama.disconnected')).toBeInTheDocument()
  })

  it('treats a thrown error as disconnected', async () => {
    mockedCheckStatus.mockRejectedValue(new Error('network error'))
    const user = userEvent.setup()
    render(<LlmSection />)
    await user.click(screen.getByText('settings.ollama.test'))
    expect(await screen.findByText('settings.ollama.disconnected')).toBeInTheDocument()
  })

  it('switches to a model dropdown listing the detected models once connected', async () => {
    mockedCheckStatus.mockResolvedValue({ connected: true, models: ['llama3.2', 'mistral'] })
    const user = userEvent.setup()
    render(<LlmSection />)
    await user.click(screen.getByText('settings.ollama.test'))
    await screen.findByText('settings.ollama.connected:{"count":2}')
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
    await user.selectOptions(select, 'mistral')
    expect(useSettingsStore.getState().settings.ollama.model).toBe('mistral')
  })
})

describe('LlmSection — fields', () => {
  it('binds temperature and timeout', async () => {
    const user = userEvent.setup()
    render(<LlmSection />)
    const temperatureInput = screen.getByDisplayValue('0.3')
    await user.clear(temperatureInput)
    await user.type(temperatureInput, '0.7')
    expect(useSettingsStore.getState().settings.ollama.temperature).toBe(0.7)

    const timeoutInput = screen.getByDisplayValue('30')
    await user.clear(timeoutInput)
    await user.type(timeoutInput, '60')
    expect(useSettingsStore.getState().settings.ollama.timeoutSeconds).toBe(60)
  })

  it('toggles includeRepoContext and autoDetectScope', async () => {
    const user = userEvent.setup()
    render(<LlmSection />)
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[0])
    expect(useSettingsStore.getState().settings.ollama.includeRepoContext).toBe(false)
    await user.click(checkboxes[1])
    expect(useSettingsStore.getState().settings.ollama.autoDetectScope).toBe(false)
  })
})

describe('LlmSection — system prompt', () => {
  it('is collapsed by default and expands on click', async () => {
    const user = userEvent.setup()
    render(<LlmSection />)
    // url + model inputs both have role "textbox"; the system-prompt textarea is a 3rd once expanded.
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    await user.click(screen.getByText('settings.llm.systemPrompt'))
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
  })

  it('resets the prompt via the reset button', async () => {
    useSettingsStore.setState({ settings: { ...INITIAL_SETTINGS.settings, ollama: { ...INITIAL_SETTINGS.settings.ollama, systemPrompt: 'custom prompt' } } })
    const user = userEvent.setup()
    render(<LlmSection />)
    await user.click(screen.getByText('settings.llm.systemPrompt'))
    expect(screen.getByDisplayValue('custom prompt')).toBeInTheDocument()
    await user.click(screen.getByText('settings.llm.resetPrompt'))
    expect(useSettingsStore.getState().settings.ollama.systemPrompt).toBe('')
  })
})
