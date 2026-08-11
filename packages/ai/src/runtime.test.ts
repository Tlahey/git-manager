import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiConnectionConfig } from './config'
import { codeReviewFeature } from './features/codeReview'
import { commitRelevanceFeature } from './features/commitRelevance'
import { commitSearchAnswerFeature } from './features/commitSearchAnswer'
import { dailySummaryFeature } from './features/dailySummary'
import { fileSummaryFeature } from './features/fileSummary'
import { summaryCommitMessageFeature } from './features/summaryCommitMessage'
import { summaryExplanationFeature } from './features/summaryExplanation'
import { summaryGroupingFeature } from './features/summaryGrouping'
import {
  createCompletionService,
  createStatusService,
  createStreamingService,
  resolveGenerateConfig,
  MODEL_PROBE_INSTRUCTION,
  MODEL_PROBE_MAX_OUTPUT_TOKENS,
  MODEL_PROBE_SCHEMA,
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
  timeoutSeconds: 30,
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
      temperature: 0.7,
      timeoutSeconds: 30,
      maxTokens: RESERVED_OUTPUT_TOKENS,
    })
  })

  /** No key travels in this config: it lives in the OS keychain and the backend attaches it. */
  it('resolves the generic preset too', () => {
    expect(
      resolveGenerateConfig({ ...connection, preset: 'openai-compatible' }, 0.3)
    ).toMatchObject({ protocol: 'openai-compatible', temperature: 0.3 })
  })

  it('caps the answer at the same reserve the prompt budgets subtract', () => {
    // The pairing is the point: the prompt is built assuming the answer fits in this many tokens,
    // and sending the cap is the only thing that makes the assumption true.
    expect(resolveGenerateConfig(connection, 0.7).maxTokens).toBe(RESERVED_OUTPUT_TOKENS)
  })

  it('lets a caller override the cap for a feature whose answer is not prose', () => {
    expect(resolveGenerateConfig(connection, 0.2, 4200).maxTokens).toBe(4200)
  })

  it('takes the connection timeout when the feature declares none', () => {
    expect(resolveGenerateConfig(connection, 0.7).timeoutSeconds).toBe(30)
  })

  /**
   * A long-running feature overrides the interactive budget, and `0` means
   * unbounded — so it must survive as 0 rather than falling back to the connection.
   */
  it('lets a feature override the timeout, including with an unbounded 0', () => {
    expect(resolveGenerateConfig(connection, 0.7, undefined, 'main', 600).timeoutSeconds).toBe(600)
    expect(resolveGenerateConfig(connection, 0.7, undefined, 'main', 0).timeoutSeconds).toBe(0)
  })

  it('sends a fast-tier feature to the second model, keeping the same endpoint', () => {
    const config = resolveGenerateConfig({ ...connection, fastModel: 'tiny' }, 0.1, 160, 'fast')
    expect(config).toMatchObject({
      model: 'tiny',
      // A model swap and nothing else: a second provider would be a different feature entirely.
      url: connection.url,
    })
  })

  it('leaves every other feature on the main model even when a fast one is configured', () => {
    expect(resolveGenerateConfig({ ...connection, fastModel: 'tiny' }, 0.2).model).toBe('llama3.2')
  })

  it('ignores an unset or blank fast model, which is the default setup', () => {
    expect(resolveGenerateConfig(connection, 0.1, 160, 'fast').model).toBe('llama3.2')
    expect(resolveGenerateConfig({ ...connection, fastModel: '  ' }, 0.1, 160, 'fast').model).toBe(
      'llama3.2'
    )
  })
})

describe('the fast tier', () => {
  /**
   * The guard on the whole idea. `fast` means "many calls, little judgement" — not "repetitive".
   * The commit-search verdict is the same shape of loop and is exactly where a weaker model invents
   * matches about the user's own history, so it must never acquire this tier by analogy.
   */
  it('is claimed by the per-file summary and by nothing else', () => {
    expect(fileSummaryFeature.tier).toBe('fast')
    for (const feature of [
      commitRelevanceFeature,
      commitSearchAnswerFeature,
      summaryGroupingFeature,
      summaryCommitMessageFeature,
      summaryExplanationFeature,
      codeReviewFeature,
      dailySummaryFeature,
    ]) {
      expect(feature.tier).toBeUndefined()
    }
  })
})

describe('createStreamingService', () => {
  const explanationInput = {
    scope: 'working' as const,
    repoName: 'demo',
    summaries: [{ path: 'src/a.ts', status: 'modified', intent: 'adds a', area: 'demo' }],
  }
  let transport: AiTransport
  beforeEach(() => {
    transport = mockTransport()
  })

  it('runs the feature instruction + built prompt at the feature temperature', async () => {
    const service = createStreamingService(summaryExplanationFeature, transport)
    await service.run(connection, explanationInput, 'req-1')

    expect(transport.runStream).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'openai-compatible',
        temperature: summaryExplanationFeature.temperature,
      }),
      summaryExplanationFeature.instruction,
      summaryExplanationFeature.buildPrompt(explanationInput),
      'req-1'
    )
  })

  it('forwards the request id the caller minted rather than making one up', async () => {
    // The id has to come from whatever is listening: this layer cannot mint it, because the
    // subscriber must already know it before the request starts.
    const service = createStreamingService(summaryExplanationFeature, transport)
    await service.run(connection, explanationInput, 'req-from-the-hook')
    expect(transport.runStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      'req-from-the-hook'
    )
  })

  it('cancels one generation by id, not every generation', async () => {
    const service = createStreamingService(summaryExplanationFeature, transport)
    await service.cancel('req-1')
    expect(transport.cancel).toHaveBeenCalledWith('req-1')
  })

  it('sends the default answer cap for a prose feature that declares none', async () => {
    const service = createStreamingService(summaryExplanationFeature, transport)
    await service.run(connection, explanationInput, 'req-1')
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

  const groupingInput = (paths: string[]) => ({
    repoName: 'demo',
    branch: 'main',
    summaries: paths.map((path) => ({
      path,
      status: 'modified',
      intent: 'does a thing',
      area: 'a',
    })),
  })

  it('runs the feature (forwarding its JSON schema) then parses into typed output', async () => {
    const service = createCompletionService(summaryGroupingFeature, transport)
    const input = groupingInput(['src/a.ts'])
    const commits = await service.run(connection, input)

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2 }),
      summaryGroupingFeature.instruction,
      summaryGroupingFeature.buildPrompt(input),
      summaryGroupingFeature.schema,
      expect.stringMatching(/^ai-/)
    )
    expect(commits).toEqual([{ commitMessage: 'feat: x', files: ['src/a.ts'] }])
  })

  it("sizes the answer cap from the feature's own input, not from a constant", async () => {
    // The plan must restate every path in its JSON, so a forty-file plan needs several times the
    // room a one-file plan does — and a cap that is too small breaks the parse outright rather than
    // shortening the answer.
    const smallInput = groupingInput(['src/a.ts'])
    const manyPaths = Array.from({ length: 40 }, (_, i) => `src/m${i}.ts`)
    const service = createCompletionService(summaryGroupingFeature, transport)

    await service.run(connection, smallInput)
    await service.run(connection, groupingInput(manyPaths))

    const [small, large] = (transport.runComplete as ReturnType<typeof vi.fn>).mock.calls
    expect(small[0].maxTokens).toBe(groupingOutputTokens(['src/a.ts']))
    expect(large[0].maxTokens).toBe(groupingOutputTokens(manyPaths))
    expect(large[0].maxTokens).toBeGreaterThan(small[0].maxTokens)
  })
})

describe('createStatusService.probe', () => {
  it('sends the feature-free probe prompt to the selected model at temperature 0', async () => {
    const transport = mockTransport()
    transport.runComplete = vi.fn().mockResolvedValue('{"ok": true}')
    const result = await createStatusService(transport).probe(connection)

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama3.2', temperature: 0 }),
      MODEL_PROBE_INSTRUCTION,
      MODEL_PROBE_PROMPT,
      MODEL_PROBE_SCHEMA,
      expect.stringMatching(/^ai-/)
    )
    expect(result).toMatchObject({ ok: true, reply: '{"ok": true}', structured: true })
    expect(result.durationMs).toBeTypeOf('number')
  })

  it('caps the probe timeout so a long generation budget cannot hang the button', async () => {
    const transport = mockTransport()
    await createStatusService(transport).probe({ ...connection, timeoutSeconds: 300 })

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutSeconds: MODEL_PROBE_MAX_TIMEOUT_SECONDS }),
      expect.any(String),
      expect.any(String),
      MODEL_PROBE_SCHEMA,
      expect.stringMatching(/^ai-/)
    )
  })

  it('keeps a shorter configured timeout as-is', async () => {
    const transport = mockTransport()
    await createStatusService(transport).probe({ ...connection, timeoutSeconds: 5 })

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutSeconds: 5 }),
      expect.any(String),
      expect.any(String),
      MODEL_PROBE_SCHEMA,
      expect.stringMatching(/^ai-/)
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
      expect.any(String),
      MODEL_PROBE_SCHEMA,
      expect.stringMatching(/^ai-/)
    )
    expect(MODEL_PROBE_MAX_OUTPUT_TOKENS).toBeLessThan(RESERVED_OUTPUT_TOKENS)
  })

  /**
   * The probe now carries a schema, reversing an earlier decision that it should not — but the
   * reason behind that decision is preserved rather than dropped. It was that a schema failure
   * would be reported as a connectivity failure; here the two answers are separate fields, so a
   * model that ignores the format still proves the round-trip.
   */
  it('does not let a schema-ignoring model read as a broken connection', async () => {
    const transport = mockTransport()
    transport.runComplete = vi.fn().mockResolvedValue('Sure! OK.')

    expect(await createStatusService(transport).probe(connection)).toMatchObject({
      ok: true,
      structured: false,
    })
  })

  it('tests a model the connection does not name, which is how the fast slot is validated', async () => {
    const transport = mockTransport()
    await createStatusService(transport).probe(connection, 'tiny-model')

    expect(transport.runComplete).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'tiny-model' }),
      expect.any(String),
      expect.any(String),
      MODEL_PROBE_SCHEMA,
      expect.stringMatching(/^ai-/)
    )
  })

  it('reads a fenced object as structured — the question is the shape, not the punctuation', async () => {
    const transport = mockTransport()
    transport.runComplete = vi.fn().mockResolvedValue('```json\n{"ok": true}\n```')

    expect(await createStatusService(transport).probe(connection)).toMatchObject({
      ok: true,
      structured: true,
    })
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
  /** Protocol and URL, and deliberately nothing else — above all no key, which the backend reads
   * from the OS keychain rather than being handed. */
  it('sends only protocol and url', async () => {
    const transport = mockTransport()
    const service = createStatusService(transport)
    await service.check({ ...connection, preset: 'openai-compatible' })

    expect(transport.checkStatus).toHaveBeenCalledWith({
      protocol: 'openai-compatible',
      url: 'http://localhost:11434',
    })
  })
})
