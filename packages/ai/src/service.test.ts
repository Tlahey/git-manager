import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiGenerationConfig } from './index'
import { DEFAULT_SYSTEM_PROMPT } from './prompts'
import { createAiService, type AiTransport } from './service'

const baseSettings: AiGenerationConfig = {
  preset: 'ollama', // resolves to the 'openai-compatible' protocol
  url: 'http://localhost:11434',
  model: 'llama3.2',
  apiKey: undefined,
  temperature: 0.3,
  timeoutSeconds: 30,
  systemPrompt: '',
  includeRepoContext: true,
  autoDetectScope: true,
}

function mockTransport(): AiTransport {
  return {
    generateCommitMessage: vi.fn().mockResolvedValue(undefined),
    checkStatus: vi.fn().mockResolvedValue({ connected: true, models: [] }),
    cancelGeneration: vi.fn().mockResolvedValue(undefined),
  }
}

describe('createAiService', () => {
  let transport: AiTransport

  beforeEach(() => {
    transport = mockTransport()
  })

  it('resolves the preset protocol and applies the default system prompt when blank', async () => {
    const service = createAiService(transport)
    await service.generateCommitMessage('/repo', baseSettings)

    expect(transport.generateCommitMessage).toHaveBeenCalledWith('/repo', {
      protocol: 'openai-compatible',
      url: 'http://localhost:11434',
      model: 'llama3.2',
      apiKey: undefined,
      temperature: 0.3,
      timeoutSeconds: 30,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      includeRepoContext: true,
      autoDetectScope: true,
    })
  })

  it('forwards a custom system prompt untouched', async () => {
    const service = createAiService(transport)
    await service.generateCommitMessage('/repo', { ...baseSettings, systemPrompt: 'be terse' })

    expect(transport.generateCommitMessage).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({ systemPrompt: 'be terse' })
    )
  })

  it('checkStatus sends only protocol/url/apiKey', async () => {
    const service = createAiService(transport)
    await service.checkStatus({ ...baseSettings, preset: 'anthropic', apiKey: 'sk-test' })

    expect(transport.checkStatus).toHaveBeenCalledWith({
      protocol: 'anthropic-messages',
      url: 'http://localhost:11434',
      apiKey: 'sk-test',
    })
  })

  it('cancelGeneration delegates to the transport', async () => {
    const service = createAiService(transport)
    await service.cancelGeneration()
    expect(transport.cancelGeneration).toHaveBeenCalledOnce()
  })
})
