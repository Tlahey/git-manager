import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiConnectionConfig, AiContext } from './config'
import { commitMessageFeature } from './features/commitMessage'
import { fileGroupingFeature } from './features/fileGrouping'
import {
  createCompletionService,
  createStatusService,
  createStreamingService,
  resolveGenerateConfig,
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

  it('resolves a non-openai preset protocol', () => {
    expect(resolveGenerateConfig({ ...connection, preset: 'anthropic' }, 0.3).protocol).toBe(
      'anthropic-messages'
    )
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

describe('createStatusService', () => {
  it('sends only protocol/url/apiKey', async () => {
    const transport = mockTransport()
    const service = createStatusService(transport)
    await service.check({ ...connection, preset: 'anthropic', apiKey: 'sk-test' })

    expect(transport.checkStatus).toHaveBeenCalledWith({
      protocol: 'anthropic-messages',
      url: 'http://localhost:11434',
      apiKey: 'sk-test',
    })
  })
})
