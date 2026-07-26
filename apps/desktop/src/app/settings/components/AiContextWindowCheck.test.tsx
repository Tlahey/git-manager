import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../api/ai.api', () => ({ apiGetModelContextLimits: vi.fn() }))

import { apiGetModelContextLimits } from '../../../api/ai.api'
import { AiContextWindowCheck } from './AiContextWindowCheck'
import { useSettingsStore } from '../../../stores/settings.store'

const mockedLimits = apiGetModelContextLimits as unknown as ReturnType<typeof vi.fn>

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
    mockedLimits.mockResolvedValue({ architectureMax: 32768, modelfileNumCtx: null })
    render(<AiContextWindowCheck />)
    await clickCheck()
    expect(mockedLimits).toHaveBeenCalledWith(expect.any(String), 'llama3.2')
  })

  it("reports the model's ceiling, and calls a plausible value plausible — not verified", async () => {
    // The honesty that matters: a server-side OLLAMA_CONTEXT_LENGTH is invisible from here, so
    // passing this check is not proof and the copy must not pretend otherwise.
    mockedLimits.mockResolvedValue({ architectureMax: 32768, modelfileNumCtx: null })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('The model supports up to 32768 tokens.')
    expect(result).toHaveTextContent('not proof')
  })

  it('calls out a declared window above what the model supports', async () => {
    setContextTokens(131072)
    mockedLimits.mockResolvedValue({ architectureMax: 8192, modelfileNumCtx: null })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('above what the model supports')
    expect(result.className).toContain('text-tone-danger')
  })

  it("mentions a Modelfile's pinned num_ctx without treating it as the verdict", async () => {
    // The running server may override it, so it is reported, not enforced.
    setContextTokens(8192)
    mockedLimits.mockResolvedValue({ architectureMax: 32768, modelfileNumCtx: 4096 })
    render(<AiContextWindowCheck />)
    await clickCheck()

    const result = await screen.findByTestId('ai-context-check-result')
    expect(result).toHaveTextContent('num_ctx to 4096')
    expect(result.className).not.toContain('text-tone-danger')
  })

  it('says so plainly when the provider reports nothing', async () => {
    mockedLimits.mockResolvedValue({ architectureMax: null, modelfileNumCtx: null })
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
})
