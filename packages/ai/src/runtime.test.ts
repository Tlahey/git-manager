import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiConnectionConfig, AiContext } from './config'
import { commitMessageFeature } from './features/commitMessage'
import { fileGroupingFeature } from './features/fileGrouping'
import {
  createCompletionService,
  createStatusService,
  createStreamingService,
  resolveGenerateConfig,
  MODEL_PROBE_INSTRUCTION,
  MODEL_PROBE_MAX_TIMEOUT_SECONDS,
  MODEL_PROBE_PROMPT,
  type AiTransport,
} from './runtime'

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
    })
  })

  it('resolves the generic preset too, carrying its API key through', () => {
    expect(
      resolveGenerateConfig({ ...connection, preset: 'openai-compatible', apiKey: 'sk-test' }, 0.3)
    ).toMatchObject({ protocol: 'openai-compatible', apiKey: 'sk-test', temperature: 0.3 })
  })
})

describe('createStreamingService', () => {
  let transport: AiTransport
  beforeEach(() => {
    transport = mockTransport()
  })

  it('runs the feature instruction + built prompt at the feature temperature', async () => {
    const service = createStreamingService(commitMessageFeature, transport)
    await service.run(connection, context)

    expect(transport.runStream).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'openai-compatible', temperature: 0.3 }),
      commitMessageFeature.instruction,
      commitMessageFeature.buildPrompt(context)
    )
  })

  it('delegates cancel to the transport', async () => {
    const service = createStreamingService(commitMessageFeature, transport)
    await service.cancel()
    expect(transport.cancel).toHaveBeenCalledOnce()
  })
})

describe('createCompletionService', () => {
  let transport: AiTransport
  beforeEach(() => {
    transport = mockTransport()
  })

  it('runs the feature (forwarding its JSON schema) then parses into typed output', async () => {
    const service = createCompletionService(fileGroupingFeature, transport)
    const commits = await service.run(connection, context)

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2 }),
      fileGroupingFeature.instruction,
      fileGroupingFeature.buildPrompt(context),
      fileGroupingFeature.schema
    )
    expect(commits).toEqual([{ commitMessage: 'feat: x', files: ['src/a.ts'] }])
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
