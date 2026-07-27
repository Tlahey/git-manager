import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../api/ai.api', () => ({ apiGetModelContextLimits: vi.fn() }))

import { apiGetModelContextLimits } from '../../../api/ai.api'
import { AiContextWindowCheck } from './AiContextWindowCheck'
import { useSettingsStore } from '../../../stores/settings.store'

const mockedLimits = apiGetModelContextLimits as unknown as ReturnType<typeof vi.fn>

/** Every field explicit, so a test that cares about one number still says what the other two were. */
function reportsLimits(limits: {
  architectureMax?: number | null
  modelfileNumCtx?: number | null
  allocatedContext?: number | null
  servedMaxModelLen?: number | null
}) {
  mockedLimits.mockResolvedValue({
    architectureMax: null,
    modelfileNumCtx: null,
    allocatedContext: null,
    servedMaxModelLen: null,
    ...limits,
  })
}

function setContextTokens(contextTokens: number) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, ai: { ...s.settings.ai, contextTokens, model: 'llama3.2' } },
  }))
}

async function clickCheck() {
  await userEvent.setup().click(screen.getByTestId('ai-context-check-button'))
}

beforeEach(() => {
  vi.clearAllMocks()
  setContextTokens(4096)
})

describe('AiContextWindowCheck', () => {
  it('asks the provider about the configured model', async () => {
    reportsLimits({ architectureMax: 32768 })
    render(<AiContextWindowCheck />)
    await clickCheck()
    expect(mockedLimits).toHaveBeenCalledWith(expect.any(String), 'llama3.2', undefined)
  })

  it("reports the model's ceiling, and calls an unloaded model's value plausible — not verified", async () => {
    // The honesty that matters: without the model loaded, the window the server would allocate is
    // invisible, so /api/show passing is not proof and the copy must not pretend otherwise.
    reportsLimits({ architectureMax: 32768 })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('The model supports up to 32768 tokens.')
    expect(result).toHaveTextContent('plausible, but unconfirmed')
  })

  it('calls out a declared window above what the model supports', async () => {
    setContextTokens(131072)
    reportsLimits({ architectureMax: 8192 })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('above what the model supports')
    expect(result.className).toContain('text-tone-danger')
  })

  it("mentions a Modelfile's pinned num_ctx without treating it as the verdict", async () => {
    // The running server may override it, so it is reported, not enforced.
    setContextTokens(8192)
    reportsLimits({ architectureMax: 32768, modelfileNumCtx: 4096 })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('num_ctx to 4096')
    expect(result.className).not.toContain('text-tone-danger')
  })

  it('flags a declared window the loaded model is not actually being served', async () => {
    // The failure the setting exists to prevent, and the one nothing could detect before /api/ps:
    // the model supports 128k, the user declared 32k, the server allocated 4k.
    setContextTokens(32768)
    reportsLimits({ architectureMax: 131072, allocatedContext: 4096 })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('The server currently serves it with a 4096-token window.')
    expect(result).toHaveTextContent('Lower it to 4096')
    expect(result.className).toContain('text-tone-danger')
  })

  it('points out a window the server would serve more of, without alarming', async () => {
    setContextTokens(4096)
    reportsLimits({ architectureMax: 131072, allocatedContext: 40960 })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('Raise it to 40960')
    expect(result.className).not.toContain('text-tone-danger')
  })

  it('calls a matching value verified rather than merely plausible', async () => {
    setContextTokens(40960)
    reportsLimits({ architectureMax: 131072, allocatedContext: 40960 })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('verified against what the server actually allocates')
  })

  it('answers from /api/ps alone when /api/show reported nothing', async () => {
    setContextTokens(40960)
    reportsLimits({ allocatedContext: 40960 })
    render(<AiContextWindowCheck />)
    await clickCheck()
    expect(await screen.findByTestId('ai-context-check-result')).toHaveTextContent(
      'verified against what the server actually allocates'
    )
  })

  it('says so plainly when the provider reports nothing', async () => {
    reportsLimits({})
    render(<AiContextWindowCheck />)
    await clickCheck()
    expect(await screen.findByTestId('ai-context-check-result')).toHaveTextContent(
      'did not report a context length'
    )
  })

  it('surfaces a transport failure instead of reading as "unknown"', async () => {
    mockedLimits.mockRejectedValue(new Error('connection refused'))
    render(<AiContextWindowCheck />)
    await clickCheck()
    expect(await screen.findByTestId('ai-context-check-result')).toHaveTextContent(
      'connection refused'
    )
  })

  it('cannot be run without a model to ask about', () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, ai: { ...s.settings.ai, model: '' } },
    }))
    render(<AiContextWindowCheck />)
    expect(screen.getByTestId('ai-context-check-button')).toBeDisabled()
  })

  it('sends the API key, without which a server like omlx reports no window at all', async () => {
    useSettingsStore.setState((st) => ({
      settings: { ...st.settings, ai: { ...st.settings.ai, apiKey: 'sk-local' } },
    }))
    reportsLimits({ servedMaxModelLen: 128000 })
    render(<AiContextWindowCheck />)
    await clickCheck()
    expect(mockedLimits).toHaveBeenCalledWith(expect.any(String), 'llama3.2', 'sk-local')
  })

  it('reports a window an OpenAI-compatible provider declares, where Ollama tells us nothing', async () => {
    reportsLimits({ servedMaxModelLen: 128000 })
    render(<AiContextWindowCheck />)
    await clickCheck()
    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('serves up to 128000 tokens')
    // The default 4096 in front of a 128k model: nothing is broken, which is why nothing complained.
    expect(result).toHaveTextContent('far below')
  })

  it('offers to apply the reported window in one click', async () => {
    reportsLimits({ servedMaxModelLen: 128000 })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const apply = await screen.findByTestId('ai-context-apply-button')
    expect(apply).toHaveTextContent('Use 128000 tokens')
    await userEvent.setup().click(apply)

    expect(useSettingsStore.getState().settings.ai.contextTokens).toBe(128000)
  })

  it('offers nothing to apply when the declared window is already right', async () => {
    setContextTokens(128000)
    reportsLimits({ servedMaxModelLen: 128000 })
    render(<AiContextWindowCheck />)
    await clickCheck()
    await screen.findByTestId('ai-context-check-result')
    expect(screen.queryByTestId('ai-context-apply-button')).not.toBeInTheDocument()
  })

  it('prefers the allocated window over the declared ceiling when offering one', async () => {
    reportsLimits({ servedMaxModelLen: 128000, allocatedContext: 40960 })
    render(<AiContextWindowCheck />)
    await clickCheck()
    expect(await screen.findByTestId('ai-context-apply-button')).toHaveTextContent('Use 40960')
  })
})
