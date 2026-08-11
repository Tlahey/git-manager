import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../api/ai.api', () => ({
  aiStatusService: { check: vi.fn(), probe: vi.fn() },
}))

// The API key field talks to the OS keychain, which a jsdom run has none of. Mocked here rather
// than exercised: `AiApiKeyField` has its own suite, and what this one asserts is when the field is
// *offered*, which is a property of the preset.
vi.mock('../../../api/credentials.api', () => ({
  apiHasCredential: vi.fn().mockResolvedValue(false),
  apiStoreCredential: vi.fn().mockResolvedValue(undefined),
  apiDeleteCredential: vi.fn().mockResolvedValue(undefined),
}))

import { MAX_AI_CONCURRENCY } from '@git-manager/ai'
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

describe('AiProviderForm — layout', () => {
  /**
   * The page had grown to a flat run of eleven identically-weighted fields, which is read as a wall.
   * The groups are what say where "reaching a model" stops and "what it may spend" begins.
   */
  it('splits the page into named groups instead of one flat run of fields', () => {
    render(<AiProviderForm />)

    expect(screen.getByTestId('ai-group-provider')).toBeInTheDocument()
    expect(screen.getByTestId('ai-group-models')).toBeInTheDocument()
    expect(screen.getByTestId('ai-group-limits')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Models' })).toBeInTheDocument()
  })

  it('opens without a rule above the first group', () => {
    render(<AiProviderForm />)
    expect(screen.getByTestId('ai-group-provider').className).not.toContain('border-t')
    expect(screen.getByTestId('ai-group-models').className).toContain('border-t')
  })

  it('puts the two models side by side, with one test button under both', () => {
    useAiStatusStore.setState({
      state: 'connected',
      models: ['llama3.2', 'tiny'],
      lastCheckedAt: Date.now(),
    })
    render(<AiProviderForm />)

    const group = screen.getByTestId('ai-group-models')
    expect(group.querySelector('.sm\\:grid-cols-2')).not.toBeNull()
    expect(group).toContainElement(screen.getByTestId('ai-model-select'))
    expect(group).toContainElement(screen.getByTestId('ai-fast-model-select'))
    // One probe for the pair — not one per column.
    expect(screen.getAllByTestId('ai-probe-model-button')).toHaveLength(1)
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

  /**
   * The second slot is optional and empty by default: the normal setup is one model, and a field
   * that forces a choice would push users into configuring a fast lane they do not need.
   */
  it('leaves the fast model unset, and offers "same as the main model"', () => {
    useAiStatusStore.setState({
      state: 'connected',
      models: ['llama3.2', 'tiny'],
      lastCheckedAt: Date.now(),
    })
    render(<AiProviderForm />)

    expect(screen.getByTestId('ai-fast-model-select')).toHaveValue('')
    expect(screen.getByText('Same as the main model')).toBeInTheDocument()
    expect(useSettingsStore.getState().settings.ai.fastModel).toBeUndefined()
  })

  it('records the fast model, and says what it is actually used for', async () => {
    useAiStatusStore.setState({
      state: 'connected',
      models: ['llama3.2', 'tiny'],
      lastCheckedAt: Date.now(),
    })
    const user = userEvent.setup()
    render(<AiProviderForm />)

    await user.selectOptions(screen.getByTestId('ai-fast-model-select'), 'tiny')

    expect(useSettingsStore.getState().settings.ai.fastModel).toBe('tiny')
    expect(screen.getByText(/only for the per-file summaries/i)).toBeInTheDocument()
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

  // The key itself is not a setting any more — it lives in the OS keychain, so there is nothing on
  // `settings.ai` to assert against and nothing for a preset change to drop. What is still this
  // form's business is *whether the field is offered*, which follows the preset.
  it('offers an API key field only on the generic preset', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)
    expect(screen.queryByTestId('ai-api-key-input')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('ai-provider-select'))
    await user.click(screen.getByTestId('ai-provider-option-openai-compatible'))
    expect(await screen.findByTestId('ai-api-key-input')).toBeInTheDocument()

    await user.click(screen.getByTestId('ai-provider-select'))
    await user.click(screen.getByTestId('ai-provider-option-ollama'))
    expect(screen.queryByTestId('ai-api-key-input')).not.toBeInTheDocument()
  })

  /**
   * Two minutes by default: for a one-shot answer the budget caps the entire generation, and a local
   * model reading a whole diff needs more than the 30s this used to be — a ten-commit history search
   * lost six commits to exactly that.
   */
  it('defaults the timeout to something a local model can actually use', () => {
    render(<AiProviderForm />)
    expect(screen.getByTestId('ai-timeout-input')).toHaveValue(120)
  })

  /** The setting bounds the wait for the *first* token on a stream and the whole generation on a
   * one-shot call — two different things behind one number, which is worth spelling out under it. */
  it('explains what the budget actually bounds', () => {
    render(<AiProviderForm />)
    const hint = screen.getByText(/how long to wait for the/i)
    expect(hint).toHaveTextContent(/first/i)
    expect(hint).toHaveTextContent(/caps the whole generation/i)
    expect(hint).toHaveTextContent(/bounded by a token cap, not by this/i)
  })

  it('binds the request timeout', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)
    const timeoutInput = screen.getByTestId('ai-timeout-input')
    await user.clear(timeoutInput)
    await user.type(timeoutInput, '90')
    expect(useSettingsStore.getState().settings.ai.timeoutSeconds).toBe(90)
  })

  /**
   * Zero is a real value, not an empty field. A budget guessed too low does not degrade an answer,
   * it deletes commits from it — one real search lost eight of ten, every one at exactly the
   * configured mark — so a user who would rather wait has to be able to say so.
   */
  it('accepts zero as "no budget", and says what that does and does not remove', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)
    const timeoutInput = screen.getByTestId('ai-timeout-input')
    await user.clear(timeoutInput)
    await user.type(timeoutInput, '0')

    expect(useSettingsStore.getState().settings.ai.timeoutSeconds).toBe(0)
    const notice = screen.getByTestId('ai-timeout-none')
    expect(notice).toHaveTextContent(/waits until the model answers/i)
    // The three clocks it does NOT remove, because the point is that only one of four is gone.
    expect(notice).toHaveTextContent(/unreachable provider still fails in seconds/i)
    expect(notice).toHaveTextContent(/dead stream is still cut/i)
    expect(notice).toHaveTextContent(/output is still capped/i)
  })

  it('says nothing about no-budget while a budget is set', () => {
    render(<AiProviderForm />)
    expect(screen.queryByTestId('ai-timeout-none')).not.toBeInTheDocument()
  })

  /**
   * One call at a time out of the box, matching the default provider: Ollama serves one generation
   * per model unless told otherwise, so anything higher would queue at the socket and only cost
   * cancellation latency.
   */
  it('defaults to one call in flight', () => {
    render(<AiProviderForm />)
    expect(screen.getByTestId('ai-concurrency-input')).toHaveValue(1)
  })

  it('binds how many calls run at once', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)
    const input = screen.getByTestId('ai-concurrency-input')
    await user.clear(input)
    await user.type(input, '4')
    expect(useSettingsStore.getState().settings.ai.concurrency).toBe(4)
  })

  /** Whether concurrency helps is the server's decision, so the hint has to say measure, not faster. */
  it('says the gain depends on the server rather than promising one', () => {
    render(<AiProviderForm />)
    const hint = screen.getByText(/how many model calls run at once/i)
    expect(hint).toHaveTextContent(/your server's decision/i)
    expect(hint).toHaveTextContent(/each individual call gets SLOWER/i)
    expect(hint).toHaveTextContent(/measure/i)
  })

  /**
   * The escape hatch for what no two servers spell the same way — turning a reasoning model's
   * thinking off above all. The app cannot pick a spelling, so the user names theirs.
   */
  describe('extra request fields', () => {
    it('persists a JSON object', () => {
      seedChecked()
      render(<AiProviderForm />)
      const box = screen.getByTestId('ai-extra-body-input')
      fireEvent.change(box, { target: { value: '{"reasoning_effort":"none"}' } })

      expect(useSettingsStore.getState().settings.ai.extraBody).toEqual({
        reasoning_effort: 'none',
      })
      expect(screen.queryByTestId('ai-extra-body-error')).not.toBeInTheDocument()
    })

    /** A half-typed object must not reach the transport, where it would 400 every AI call. */
    it('saves nothing while the text does not parse, and says so', () => {
      seedChecked()
      render(<AiProviderForm />)
      const box = screen.getByTestId('ai-extra-body-input')
      fireEvent.change(box, { target: { value: '{"reasoning_effort":' } })

      expect(useSettingsStore.getState().settings.ai.extraBody).toBeUndefined()
      expect(screen.getByTestId('ai-extra-body-error')).toBeInTheDocument()
    })

    it('rejects valid JSON that is not an object', () => {
      // An array spliced into a request body means nothing, and the 400 would land far from here.
      seedChecked()
      render(<AiProviderForm />)
      fireEvent.change(screen.getByTestId('ai-extra-body-input'), {
        target: { value: '["reasoning_effort"]' },
      })

      expect(useSettingsStore.getState().settings.ai.extraBody).toBeUndefined()
      expect(screen.getByTestId('ai-extra-body-error')).toBeInTheDocument()
    })

    it('treats an emptied box as "nothing extra" rather than an error', () => {
      seedChecked()
      render(<AiProviderForm />)
      const box = screen.getByTestId('ai-extra-body-input')
      fireEvent.change(box, { target: { value: '{"think":false}' } })
      fireEvent.change(box, { target: { value: '  ' } })

      expect(useSettingsStore.getState().settings.ai.extraBody).toEqual({})
      expect(screen.queryByTestId('ai-extra-body-error')).not.toBeInTheDocument()
    })

    /** Three spellings, no standard — the hint has to name them or the field is unusable. */
    it('names the spellings the user might need', () => {
      render(<AiProviderForm />)
      const hint = screen.getByText(/Merged into every request/i)
      expect(hint).toHaveTextContent(/reasoning_effort/)
      expect(hint).toHaveTextContent(/chat_template_kwargs/)
      expect(hint).toHaveTextContent(/think/)
      expect(hint).toHaveTextContent(/rejects every call/i)
    })
  })

  it('refuses a width past the ceiling, whatever is typed', async () => {
    seedChecked()
    const user = userEvent.setup()
    render(<AiProviderForm />)
    const input = screen.getByTestId('ai-concurrency-input')
    await user.clear(input)
    await user.type(input, '500')
    expect(useSettingsStore.getState().settings.ai.concurrency).toBe(MAX_AI_CONCURRENCY)
  })
})
