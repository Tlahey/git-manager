import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  COMMIT_MESSAGE_INSTRUCTION,
  FILE_GROUPING_SCHEMA,
  type AiCheckConfig,
  type AiConnectionConfig,
  type AiContext,
} from '@git-manager/ai'

vi.mock('../lib/tauri', () => ({
  checkAiStatus: vi.fn(),
  getAiContext: vi.fn(),
  aiGenerateStream: vi.fn(),
  aiComplete: vi.fn(),
  cancelGeneration: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './ai.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

const connection: AiConnectionConfig = {
  preset: 'ollama',
  url: 'http://localhost:11434',
  model: 'llama3.2',
  timeoutSeconds: 30,
}

const context: AiContext = {
  diff: 'diff body',
  repoName: 'demo',
  branch: 'main',
  files: [{ path: 'src/a.ts', status: 'modified' }],
}

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

  it('apiGetAiContext delegates to getAiContext with path + scope', async () => {
    mocked.getAiContext.mockResolvedValue(context)
    expect(await api.apiGetAiContext('/repo', 'working')).toEqual(context)
    expect(mocked.getAiContext).toHaveBeenCalledWith('/repo', 'working', undefined)
  })

  it('apiGetAiContext forwards a base ref for range scope', async () => {
    mocked.getAiContext.mockResolvedValue(context)
    await api.apiGetAiContext('/repo', 'range', 'main')
    expect(mocked.getAiContext).toHaveBeenCalledWith('/repo', 'range', 'main')
  })

  it('apiCancelGeneration delegates to cancelGeneration', async () => {
    mocked.cancelGeneration.mockResolvedValue(undefined)
    await api.apiCancelGeneration()
    expect(mocked.cancelGeneration).toHaveBeenCalledOnce()
  })
})

describe('feature services', () => {
  it('commitMessageService resolves preset→protocol + feature instruction, streams the prompt', async () => {
    mocked.aiGenerateStream.mockResolvedValue(undefined)
    await api.commitMessageService.run(connection, context)

    expect(mocked.aiGenerateStream).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'openai-compatible', temperature: 0.3 }),
      COMMIT_MESSAGE_INSTRUCTION,
      expect.stringContaining('--- DIFF ---')
    )
  })

  it('fileGroupingService completes with the JSON schema then parses into typed commits', async () => {
    mocked.aiComplete.mockResolvedValue('{"commits":[{"commitMessage":"feat: a","files":["src/a.ts"]}]}')
    const commits = await api.fileGroupingService.run(connection, context)

    expect(mocked.aiComplete).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2 }),
      expect.any(String),
      expect.stringContaining('Changed files:'),
      FILE_GROUPING_SCHEMA
    )
    expect(commits).toEqual([{ commitMessage: 'feat: a', files: ['src/a.ts'] }])
  })

  it('aiStatusService.check sends only protocol/url/apiKey', async () => {
    mocked.checkAiStatus.mockResolvedValue({ connected: true, models: [] })
    await api.aiStatusService.check(connection)
    expect(mocked.checkAiStatus).toHaveBeenCalledWith({
      protocol: 'openai-compatible',
      url: 'http://localhost:11434',
      apiKey: undefined,
    })
  })
})
