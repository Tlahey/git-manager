import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AiGenerateConfig } from '@git-manager/ai'

const { rawInvoke } = vi.hoisted(() => ({ rawInvoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: rawInvoke }))

import { recordAiTranscript } from './aiTranscriptLog'

const config: AiGenerateConfig = {
  protocol: 'openai-compatible',
  url: 'http://localhost:8000',
  model: 'demo-model',
  apiKey: 'sk-super-secret',
  temperature: 0.2,
  timeoutSeconds: 30,
  maxTokens: 975,
}

const call = {
  featureId: 'summary-grouping',
  config,
  systemPrompt: 'You are an expert.',
  userPrompt: 'Group these files.',
  durationMs: 1200,
  status: 'ok' as const,
  response: '{"commits":[]}',
}

beforeEach(() => {
  vi.clearAllMocks()
  rawInvoke.mockResolvedValue(undefined)
  ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
})

/** The entry as it would be written to disk. */
function written() {
  return rawInvoke.mock.calls[0][1].entries[0] as Record<string, unknown>
}

describe('recordAiTranscript', () => {
  it('writes the prompts and the answer, which the activity log cannot carry', () => {
    recordAiTranscript(call)

    expect(rawInvoke).toHaveBeenCalledWith('append_ai_log', expect.anything())
    const entry = written()
    expect(entry.systemPrompt).toBe('You are an expert.')
    expect(entry.userPrompt).toBe('Group these files.')
    expect(entry.response).toBe('{"commits":[]}')
    expect(entry.featureId).toBe('summary-grouping')
  })

  it('records the model and the answer cap, which is what sizing bugs turn on', () => {
    recordAiTranscript(call)
    const entry = written()
    expect(entry.model).toBe('demo-model')
    expect(entry.maxTokens).toBe(975)
    expect(entry.temperature).toBe(0.2)
  })

  /** The config carries the user's key; the entry is built field by field so a future field added
   * to `AiGenerateConfig` cannot ride along onto disk. */
  it('never writes the API key or the provider URL', () => {
    recordAiTranscript(call)
    expect(JSON.stringify(written())).not.toContain('sk-super-secret')
    expect(written()).not.toHaveProperty('apiKey')
  })

  it('records a failed call too — the one most worth having', () => {
    recordAiTranscript({ ...call, status: 'error', response: undefined, error: 'provider down' })
    const entry = written()
    expect(entry.status).toBe('error')
    expect(entry.error).toBe('provider down')
  })

  it('does nothing outside a Tauri window', () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    recordAiTranscript(call)
    expect(rawInvoke).not.toHaveBeenCalled()
  })

  it('swallows a write failure rather than breaking the generation it observes', async () => {
    rawInvoke.mockRejectedValue(new Error('disk full'))
    expect(() => recordAiTranscript(call)).not.toThrow()
    await Promise.resolve()
  })
})
