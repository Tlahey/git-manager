import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../api/ai.api', () => ({ aiStatusService: { check: vi.fn(), probe: vi.fn() } }))

import { aiStatusService } from '../../../api/ai.api'
import { AiModelProbe } from './AiModelProbe'
import { useSettingsStore } from '../../../stores/settings.store'

const mockedProbe = aiStatusService.probe as unknown as ReturnType<typeof vi.fn>
const INITIAL_SETTINGS = useSettingsStore.getState()

function setModel(model: string) {
  const { settings, updateSettings } = useSettingsStore.getState()
  updateSettings({ ai: { ...settings.ai, model } })
}

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('AiModelProbe', () => {
  it('reports the model and the round-trip time on success', async () => {
    mockedProbe.mockResolvedValue({ ok: true, reply: 'OK', durationMs: 842 })
    const user = userEvent.setup()
    render(<AiModelProbe />)

    await user.click(screen.getByTestId('ai-probe-model-button'))
    expect(await screen.findByTestId('ai-probe-status')).toHaveTextContent(
      'llama3.2 answered in 842 ms'
    )
    expect(screen.getByTestId('ai-probe-detail')).toHaveTextContent('OK')
  })

  it('probes the connection as currently configured, not as it was on mount', async () => {
    mockedProbe.mockResolvedValue({ ok: true, reply: 'OK', durationMs: 10 })
    const user = userEvent.setup()
    render(<AiModelProbe />)

    setModel('mistral')
    await user.click(screen.getByTestId('ai-probe-model-button'))
    expect(mockedProbe).toHaveBeenCalledWith(expect.objectContaining({ model: 'mistral' }))
  })

  it('decodes a backend error payload into readable copy', async () => {
    mockedProbe.mockResolvedValue({
      ok: false,
      reply: '',
      error: JSON.stringify({
        code: 'AI_PROVIDER_ERROR',
        message: 'AI provider error: AI_MODEL_NOT_FOUND',
        detail: null,
      }),
      durationMs: 120,
    })
    const user = userEvent.setup()
    render(<AiModelProbe />)

    await user.click(screen.getByTestId('ai-probe-model-button'))
    expect(await screen.findByTestId('ai-probe-status')).toHaveTextContent(
      'llama3.2 did not answer'
    )
    expect(screen.getByTestId('ai-probe-detail')).toHaveTextContent('AI model not found.')
  })

  it('surfaces an unmapped provider error verbatim rather than generic copy', async () => {
    mockedProbe.mockResolvedValue({
      ok: false,
      reply: '',
      error: JSON.stringify({ code: 'HTTP_ERROR', message: 'HTTP 401 Unauthorized' }),
      durationMs: 55,
    })
    const user = userEvent.setup()
    render(<AiModelProbe />)

    await user.click(screen.getByTestId('ai-probe-model-button'))
    expect(await screen.findByTestId('ai-probe-detail')).toHaveTextContent('HTTP 401 Unauthorized')
  })

  it('truncates a chatty reply instead of flooding the settings page', async () => {
    mockedProbe.mockResolvedValue({ ok: true, reply: 'A'.repeat(400), durationMs: 20 })
    const user = userEvent.setup()
    render(<AiModelProbe />)

    await user.click(screen.getByTestId('ai-probe-model-button'))
    const detail = await screen.findByTestId('ai-probe-detail')
    expect(detail.textContent).toHaveLength(121)
    expect(detail.textContent?.endsWith('…')).toBe(true)
  })

  it('is disabled with an explanation until a model is set', async () => {
    setModel('')
    render(<AiModelProbe />)

    expect(screen.getByTestId('ai-probe-model-button')).toBeDisabled()
    expect(screen.getByText('Pick a model first.')).toBeInTheDocument()
    expect(mockedProbe).not.toHaveBeenCalled()
  })

  it('shows an in-flight state and re-enables the button afterwards', async () => {
    let resolveProbe: (value: unknown) => void = () => {}
    mockedProbe.mockReturnValue(new Promise((resolve) => (resolveProbe = resolve)))
    const user = userEvent.setup()
    render(<AiModelProbe />)

    await user.click(screen.getByTestId('ai-probe-model-button'))
    const button = screen.getByTestId('ai-probe-model-button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Testing…')

    resolveProbe({ ok: true, reply: 'OK', durationMs: 5 })
    expect(await screen.findByTestId('ai-probe-status')).toBeInTheDocument()
    expect(screen.getByTestId('ai-probe-model-button')).toBeEnabled()
  })
})
