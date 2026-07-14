import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_SYSTEM_PROMPT, type AiCheckConfig, type AiGenerateConfig } from '@git-manager/ai'

vi.mock('../lib/tauri', () => ({
  checkAiStatus: vi.fn(),
  generateCommitMessage: vi.fn(),
  cancelGeneration: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './ai.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ai.api pass-throughs', () => {
  it('apiCheckAiStatus delegates to checkAiStatus with the config', async () => {
    const config: AiCheckConfig = { protocol: 'openai-compatible', url: 'http://localhost:11434' }
    mocked.checkAiStatus.mockResolvedValue({ connected: true, models: [] })
    expect(await api.apiCheckAiStatus(config)).toEqual({ connected: true, models: [] })
    expect(mocked.checkAiStatus).toHaveBeenCalledWith(config)
  })

  it('apiGenerateCommitMessage delegates to generateCommitMessage with the config', async () => {
    const config: AiGenerateConfig = {
      protocol: 'openai-compatible',
      url: 'http://localhost:11434',
      model: 'llama3.2',
      temperature: 0.3,
      timeoutSeconds: 30,
      includeRepoContext: true,
      autoDetectScope: true,
    }
    mocked.generateCommitMessage.mockResolvedValue(undefined)
    await api.apiGenerateCommitMessage('/repo', config)
    expect(mocked.generateCommitMessage).toHaveBeenCalledWith('/repo', config)
  })

  it('apiCancelGeneration delegates to cancelGeneration', async () => {
    mocked.cancelGeneration.mockResolvedValue(undefined)
    await api.apiCancelGeneration()
    expect(mocked.cancelGeneration).toHaveBeenCalledOnce()
  })
})

describe('aiService wiring', () => {
  it('resolves preset→protocol + default prompt, then forwards to the Tauri transport', async () => {
    mocked.generateCommitMessage.mockResolvedValue(undefined)
    await api.aiService.generateCommitMessage('/repo', {
      preset: 'ollama',
      url: 'http://localhost:11434',
      model: 'llama3.2',
      temperature: 0.3,
      timeoutSeconds: 30,
      systemPrompt: '',
      includeRepoContext: true,
      autoDetectScope: true,
    })
    expect(mocked.generateCommitMessage).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({
        protocol: 'openai-compatible',
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
      })
    )
  })
})
