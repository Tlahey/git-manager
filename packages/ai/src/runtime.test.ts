import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiConnectionConfig, AiContext } from './config'
import { workingExplanationFeature } from './features/workingExplanation'
import { fileGroupingFeature } from './features/fileGrouping'
import {
  createCompletionService,
  createStatusService,
  createStreamingService,
  resolveGenerateConfig,
  MODEL_PROBE_INSTRUCTION,
  MODEL_PROBE_MAX_OUTPUT_TOKENS,
  MODEL_PROBE_MAX_TIMEOUT_SECONDS,
  MODEL_PROBE_PROMPT,
  type AiTransport,
} from './runtime'
import { groupingOutputTokens } from './features/fileGrouping'
import { RESERVED_OUTPUT_TOKENS } from './promptSize'

const connection: AiConnectionConfig = {
  preset: 'ollama', // resolves to the 'openai-compatible' protocol
  url: 'http://localhost:11434',
  model: 'llama3.2',
  apiKey: undefined,
  timeoutSeconds: 30,
}

const context: AiContext = {
  diff: 'diff --git a/a.ts b/a.ts',
  repoName: 'demo',
  branch: 'main',
  files: [{ path: 'src/a.ts', status: 'modified' }],
}

function mockTransport(): AiTransport {
  return {
    runStream: vi.fn().mockResolvedValue(undefined),
    runComplete: vi
      .fn()
      .mockResolvedValue('{"commits":[{"commitMessage":"feat: x","files":["src/a.ts"]}]}'),
    checkStatus: vi.fn().mockResolvedValue({ connected: true, models: ['llama3.2'] }),
    cancel: vi.fn().mockResolvedValue(undefined),
  }
}

describe('resolveGenerateConfig', () => {
  it('resolves the preset protocol and injects the feature temperature', () => {
    expect(resolveGenerateConfig(connection, 0.7)).toEqual({
      protocol: 'openai-compatible',
      url: 'http://localhost:11434',
      model: 'llama3.2',
      apiKey: undefined,
      temperature: 0.7,
      timeoutSeconds: 30,
      maxTokens: RESERVED_OUTPUT_TOKENS,
    })
  })

  it('resolves the generic preset too, carrying its API key through', () => {
    expect(
      resolveGenerateConfig({ ...connection, preset: 'openai-compatible', apiKey: 'sk-test' }, 0.3)
    ).toMatchObject({ protocol: 'openai-compatible', apiKey: 'sk-test', temperature: 0.3 })
  })

  it('caps the answer at the same reserve the prompt budgets subtract', () => {
    // The pairing is the point: the prompt is built assuming the answer fits in this many tokens,
    // and sending the cap is the only thing that makes the assumption true.
    expect(resolveGenerateConfig(connection, 0.7).maxTokens).toBe(RESERVED_OUTPUT_TOKENS)
  })

  it('lets a caller override the cap for a feature whose answer is not prose', () => {
    expect(resolveGenerateConfig(connection, 0.2, 4200).maxTokens).toBe(4200)
  })
})

describe('createStreamingService', () => {
  let transport: AiTransport
  beforeEach(() => {
    transport = mockTransport()
  })

  it('runs the feature instruction + built prompt at the feature temperature', async () => {
    const service = createStreamingService(workingExplanationFeature, transport)
    await service.run(connection, { context }, 'req-1')

    expect(transport.runStream).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'openai-compatible',
        temperature: workingExplanationFeature.temperature,
      }),
      workingExplanationFeature.instruction,
      workingExplanationFeature.buildPrompt({ context }),
      'req-1'
    )
  })

  it('forwards the request id the caller minted rather than making one up', async () => {
    // The id has to come from whatever is listening: this layer cannot mint it, because the
    // subscriber must already know it before the request starts.
    const service = createStreamingService(workingExplanationFeature, transport)
    await service.run(connection, { context }, 'req-from-the-hook')
    expect(transport.runStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      'req-from-the-hook'
    )
  })

  it('cancels one generation by id, not every generation', async () => {
    const service = createStreamingService(workingExplanationFeature, transport)
    await service.cancel('req-1')
    expect(transport.cancel).toHaveBeenCalledWith('req-1')
  })

  it('sends the default answer cap for a prose feature that declares none', async () => {
    const service = createStreamingService(workingExplanationFeature, transport)
    await service.run(connection, { context }, 'req-1')
    expect(transport.runStream).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: RESERVED_OUTPUT_TOKENS }),
      expect.any(String),
      expect.any(String),
      expect.any(String)
    )
  })
})

describe('createCompletionService', () => {
  let transport: AiTransport
  beforeEach(() => {
    transport = mockTransport()
  })

  it('runs the feature (forwarding its JSON schema) then parses into typed output', async () => {
    const service = createCompletionService(fileGroupingFeature, transport)
    const commits = await service.run(connection, { context })

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2 }),
      fileGroupingFeature.instruction,
      fileGroupingFeature.buildPrompt({ context }),
      fileGroupingFeature.schema
    )
    expect(commits).toEqual([{ commitMessage: 'feat: x', files: ['src/a.ts'] }])
  })

  it("sizes the answer cap from the feature's own input, not from a constant", async () => {
    // File grouping must restate every changed path in its JSON, so a forty-file plan needs several
    // times the room a one-file plan does — and a cap that is too small breaks the parse outright
    // rather than shortening the answer.
    const many: AiContext = {
      ...context,
      files: Array.from({ length: 40 }, (_, i) => ({ path: `src/m${i}.ts`, status: 'modified' })),
    }
    const service = createCompletionService(fileGroupingFeature, transport)

    await service.run(connection, { context })
    await service.run(connection, { context: many })

    const [small, large] = (transport.runComplete as ReturnType<typeof vi.fn>).mock.calls
    expect(small[0].maxTokens).toBe(groupingOutputTokens(1))
    expect(large[0].maxTokens).toBe(groupingOutputTokens(40))
    expect(large[0].maxTokens).toBeGreaterThan(small[0].maxTokens)
  })
})

describe('createStatusService.probe', () => {
  it('sends the feature-free probe prompt to the selected model at temperature 0', async () => {
    const transport = mockTransport()
    transport.runComplete = vi.fn().mockResolvedValue('OK')
    const result = await createStatusService(transport).probe(connection)

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama3.2', temperature: 0 }),
      MODEL_PROBE_INSTRUCTION,
      MODEL_PROBE_PROMPT
    )
    expect(result).toMatchObject({ ok: true, reply: 'OK' })
    expect(result.durationMs).toBeTypeOf('number')
  })

  it('caps the probe timeout so a long generation budget cannot hang the button', async () => {
    const transport = mockTransport()
    await createStatusService(transport).probe({ ...connection, timeoutSeconds: 300 })

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutSeconds: MODEL_PROBE_MAX_TIMEOUT_SECONDS }),
      expect.any(String),
      expect.any(String)
    )
  })

  it('keeps a shorter configured timeout as-is', async () => {
    const transport = mockTransport()
    await createStatusService(transport).probe({ ...connection, timeoutSeconds: 5 })

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutSeconds: 5 }),
      expect.any(String),
      expect.any(String)
    )
  })

  it("caps the probe's answer far below a feature's, so a reasoning model can't stall it", async () => {
    // The probe's expected answer is one word. A reasoning model handed a 600-token budget spends
    // it deliberating about `ping` while the user watches a button.
    const transport = mockTransport()
    await createStatusService(transport).probe(connection)

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: MODEL_PROBE_MAX_OUTPUT_TOKENS }),
      expect.any(String),
      expect.any(String)
    )
    expect(MODEL_PROBE_MAX_OUTPUT_TOKENS).toBeLessThan(RESERVED_OUTPUT_TOKENS)
  })

  it('sends no JSON schema — a schema would fail for reasons unrelated to connectivity', async () => {
    const transport = mockTransport()
    await createStatusService(transport).probe(connection)
    expect((transport.runComplete as ReturnType<typeof vi.fn>).mock.calls[0]).toHaveLength(3)
  })

  it('treats an empty body as a failure, not a green light', async () => {
    const transport = mockTransport()
    transport.runComplete = vi.fn().mockResolvedValue('   ')

    expect(await createStatusService(transport).probe(connection)).toMatchObject({
      ok: false,
      reply: '',
      error: 'AI_EMPTY_RESPONSE',
    })
  })

  it('returns the transport failure instead of throwing, so the UI can render it', async () => {
    const transport = mockTransport()
    transport.runComplete = vi.fn().mockRejectedValue(new Error('{"code":"AI_PROVIDER_ERROR"}'))

    expect(await createStatusService(transport).probe(connection)).toMatchObject({
      ok: false,
      reply: '',
      error: '{"code":"AI_PROVIDER_ERROR"}',
    })
  })
})

describe('createStatusService', () => {
  it('sends only protocol/url/apiKey', async () => {
    const transport = mockTransport()
    const service = createStatusService(transport)
    await service.check({ ...connection, preset: 'openai-compatible', apiKey: 'sk-test' })

    expect(transport.checkStatus).toHaveBeenCalledWith({
      protocol: 'openai-compatible',
      url: 'http://localhost:11434',
      apiKey: 'sk-test',
    })
  })
})
