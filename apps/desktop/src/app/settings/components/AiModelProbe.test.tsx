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

  /**
   * The state the probe exists to catch now: the round-trip works, so the page looks green, and
   * every schema-driven feature will still fail on every call. Nothing else in the app says this
   * until a feature runs — for the history search, half an hour later.
   */
  it('warns when the model answered but ignored the JSON format', async () => {
    mockedProbe.mockResolvedValue({
      ok: true,
      structured: false,
      reply: 'Sure! OK.',
      durationMs: 90,
    })
    const user = userEvent.setup()
    render(<AiModelProbe />)

    await user.click(screen.getByTestId('ai-probe-model-button'))

    expect(await screen.findByTestId('ai-probe-status')).toHaveTextContent('answered')
    expect(screen.getByTestId('ai-probe-unstructured')).toHaveTextContent(
      /ignored the requested JSON format/i
    )
  })

  it('says nothing extra when the model honored the format', async () => {
    mockedProbe.mockResolvedValue({
      ok: true,
      structured: true,
      reply: '{"ok": true}',
      durationMs: 90,
    })
    const user = userEvent.setup()
    render(<AiModelProbe />)

    await user.click(screen.getByTestId('ai-probe-model-button'))

    expect(await screen.findByTestId('ai-probe-status')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-probe-unstructured')).not.toBeInTheDocument()
  })

  /**
   * One button covers both slots: a setup is only valid when every model it names answers, and
   * asking the user to remember to click twice is how the second one goes untested.
   */
  it('tests the fast model in the same run, and reports each separately', async () => {
    mockedProbe
      .mockResolvedValueOnce({ ok: true, structured: true, reply: '{"ok":true}', durationMs: 40 })
      .mockResolvedValueOnce({ ok: true, structured: false, reply: 'Sure!', durationMs: 12 })
    const user = userEvent.setup()
    render(<AiModelProbe fastModel="tiny-model" />)

    await user.click(screen.getByTestId('ai-probe-model-button'))

    expect(mockedProbe).toHaveBeenNthCalledWith(1, expect.anything())
    expect(mockedProbe).toHaveBeenNthCalledWith(2, expect.anything(), 'tiny-model')
    expect(await screen.findByTestId('ai-probe-status')).toHaveTextContent('llama3.2')
    expect(screen.getByTestId('ai-probe-fast-status')).toHaveTextContent('tiny-model')
    // The warning is per model: the fast one ignored the format, the main one did not.
    expect(screen.getByTestId('ai-probe-fast-unstructured')).toBeInTheDocument()
    expect(screen.queryByTestId('ai-probe-unstructured')).not.toBeInTheDocument()
  })

  it('does not spend a second model load when both slots name the same model', async () => {
    mockedProbe.mockResolvedValue({
      ok: true,
      structured: true,
      reply: '{"ok":true}',
      durationMs: 8,
    })
    const user = userEvent.setup()
    render(<AiModelProbe fastModel="llama3.2" />)

    await user.click(screen.getByTestId('ai-probe-model-button'))

    expect(mockedProbe).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('ai-probe-fast-status')).not.toBeInTheDocument()
  })

  it('names both models on the button when two will be tested', () => {
    render(<AiModelProbe fastModel="tiny-model" />)
    expect(screen.getByTestId('ai-probe-model-button')).toHaveTextContent('Test the models')
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
