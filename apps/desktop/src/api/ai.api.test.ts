import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  BRANCH_EXPLANATION_INSTRUCTION,
  CHANGE_EXPLANATION_INSTRUCTION,
  COMMIT_MESSAGE_INSTRUCTION,
  COMMIT_MESSAGE_SCHEMA,
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
import { useAiActivityStore } from '../stores/aiActivity.store'

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
  useAiActivityStore.setState({ runs: [] })
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
    expect(mocked.getAiContext).toHaveBeenCalledWith('/repo', 'working', undefined, undefined)
  })

  it('apiGetAiContext forwards a base ref for range scope', async () => {
    mocked.getAiContext.mockResolvedValue(context)
    await api.apiGetAiContext('/repo', 'range', 'main')
    expect(mocked.getAiContext).toHaveBeenCalledWith('/repo', 'range', 'main', undefined)
  })

  it('apiCancelGeneration cancels the named generation, not every one', async () => {
    mocked.cancelGeneration.mockResolvedValue(undefined)
    await api.apiCancelGeneration('req-1')
    expect(mocked.cancelGeneration).toHaveBeenCalledWith('req-1')
  })
})

describe('feature services', () => {
  it('commitMessageService resolves preset→protocol + feature instruction, completes under the schema', async () => {
    // A completion rather than a stream: the JSON grammar is what stops a reasoning model from
    // deliberating into the commit box (see COMMIT_MESSAGE_SCHEMA).
    mocked.aiComplete.mockResolvedValue('{"subject":"feat: a","body":""}')
    const draft = await api.commitMessageService.run(connection, { context })

    expect(mocked.aiComplete).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'openai-compatible', temperature: 0.3 }),
      COMMIT_MESSAGE_INSTRUCTION,
      expect.stringContaining('--- DIFF ---'),
      COMMIT_MESSAGE_SCHEMA
    )
    expect(draft).toEqual({ subject: 'feat: a', body: '' })
  })

  it('fileGroupingService completes with the JSON schema then parses into typed commits', async () => {
    mocked.aiComplete.mockResolvedValue('{"commits":[{"commitMessage":"feat: a","files":["src/a.ts"]}]}')
    const commits = await api.fileGroupingService.run(connection, { context })

    expect(mocked.aiComplete).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2 }),
      expect.any(String),
      expect.stringContaining('Changed files:'),
      FILE_GROUPING_SCHEMA
    )
    expect(commits).toEqual([{ commitMessage: 'feat: a', files: ['src/a.ts'] }])
  })

  it('changeExplanationService streams the file-explanation prompt with its own instruction', async () => {
    mocked.aiGenerateStream.mockResolvedValue(undefined)
    await api.changeExplanationService.run(connection, {
      repoName: 'demo',
      file: {
        path: 'src/a.ts',
        status: 'modified',
        patch: '@@ -1 +1 @@\n-a\n+b',
        additions: 1,
        deletions: 1,
      },
      fileContent: 'const b = 1',
    }, 'req-1')

    expect(mocked.aiGenerateStream).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'openai-compatible', temperature: 0.2 }),
      CHANGE_EXPLANATION_INSTRUCTION,
      expect.stringContaining('--- PATCH ---'),
      'req-1'
    )
  })

  it('branchExplanationService streams the branch-explanation prompt with its own instruction', async () => {
    mocked.aiGenerateStream.mockResolvedValue(undefined)
    await api.branchExplanationService.run(connection, {
      context: { ...context, baseRef: 'origin/main', rangeCommits: ['feat: a'] },
      language: 'fr',
    }, 'req-1')

    expect(mocked.aiGenerateStream).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'openai-compatible', temperature: 0.2 }),
      BRANCH_EXPLANATION_INSTRUCTION,
      expect.stringContaining('--- DIFF (base..branch) ---'),
      'req-1'
    )
  })

  it('reports the run to aiActivity while it streams, and clears it after', async () => {
    let runsDuring: { featureId: string }[] = []
    mocked.aiGenerateStream.mockImplementation(async () => {
      runsDuring = useAiActivityStore.getState().runs
    })

    await api.prDescriptionService.run(connection, { context, templateContent: null }, 'req-1')

    expect(runsDuring).toHaveLength(1)
    expect(runsDuring[0].featureId).toBe('pr-description')
    expect(useAiActivityStore.getState().runs).toEqual([])
  })

  it('clears the run when a completion feature fails', async () => {
    mocked.aiComplete.mockRejectedValue(new Error('AI_PROVIDER_NOT_RUNNING'))
    await expect(api.fileGroupingService.run(connection, { context })).rejects.toThrow()
    expect(useAiActivityStore.getState().runs).toEqual([])
  })

  it('does not report the Settings connection probe as feature work', async () => {
    mocked.aiComplete.mockImplementation(async () => {
      expect(useAiActivityStore.getState().runs).toEqual([])
      return 'OK'
    })
    await api.aiStatusService.probe(connection)
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
