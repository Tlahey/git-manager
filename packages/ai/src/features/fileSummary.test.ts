import { describe, it, expect } from 'vitest'
import {
  buildFileSummaryPrompt,
  fileSummaryFeature,
  FILE_SUMMARY_INSTRUCTION,
  FILE_SUMMARY_OUTPUT_TOKENS,
  FILE_SUMMARY_SCHEMA,
  parseFileSummary,
} from './fileSummary'

const input = {
  path: 'apps/desktop/src/hooks/useCommitBatchReview.ts',
  status: 'modified',
  diff: 'diff --git a/x b/x\n+const a = 1',
}

describe('buildFileSummaryPrompt — language', () => {
  /** Commit messages follow the repo's convention (usually English); only prose consumers ask. */
  it('says nothing about language by default', () => {
    const prompt = buildFileSummaryPrompt({ path: 'a.ts', status: 'modified', diff: '' })
    expect(prompt).not.toMatch(/Write both fields in/)
  })

  it('requests the caller’s language when one is given', () => {
    const prompt = buildFileSummaryPrompt({
      path: 'a.ts',
      status: 'modified',
      diff: '',
      language: 'fr',
    })
    expect(prompt).toContain('Write both fields in French.')
  })
})

describe('buildFileSummaryPrompt', () => {
  it('names the file with its status and carries its diff', () => {
    const prompt = buildFileSummaryPrompt(input)
    expect(prompt).toContain('apps/desktop/src/hooks/useCommitBatchReview.ts (modified)')
    expect(prompt).toContain('+const a = 1')
  })

  it('fits a small window, because one file is all it ever carries', () => {
    // The whole point of the map phase: the window stops scaling with the changeset.
    const big = { ...input, diff: 'x'.repeat(200_000), contextTokens: 4096 }
    const prompt = buildFileSummaryPrompt(big)
    expect(prompt.length).toBeLessThan(4096 * 3.5)
    expect(prompt).toContain('useCommitBatchReview.ts')
  })
})

describe('FILE_SUMMARY_SCHEMA', () => {
  /**
   * The design decision that makes the map phase incapable of losing or mangling a file: the path is
   * the caller's, never the model's. Nothing to echo back wrong.
   */
  it('asks for no path — the caller pairs the answer with the file it sent', () => {
    const schema = FILE_SUMMARY_SCHEMA.schema as { properties: Record<string, unknown> }
    const properties = schema.properties
    expect(Object.keys(properties).sort()).toEqual(['area', 'intent'])
    expect(FILE_SUMMARY_SCHEMA.strict).toBe(true)
  })
})

describe('FILE_SUMMARY_INSTRUCTION', () => {
  it('demands a concept for the area, not a directory — it is the grouping key', () => {
    expect(FILE_SUMMARY_INSTRUCTION).toContain('CONCEPT')
    expect(FILE_SUMMARY_INSTRUCTION).toMatch(/not a directory/i)
  })
})

describe('parseFileSummary', () => {
  it('reads the two fields', () => {
    expect(parseFileSummary('{"intent":"add a guard","area":"commit batching"}')).toEqual({
      intent: 'add a guard',
      area: 'commit batching',
    })
  })

  it('tolerates prose and fences around the object', () => {
    const raw = 'Sure!\n```json\n{"intent":"add a guard","area":"batching"}\n```\nHope that helps.'
    expect(parseFileSummary(raw)).toEqual({ intent: 'add a guard', area: 'batching' })
  })

  it('accepts a partial answer rather than losing the file', () => {
    // An area with no intent still groups; demanding both would turn a weak answer into a failure.
    expect(parseFileSummary('{"area":"batching"}')).toEqual({ intent: '', area: 'batching' })
  })

  it('throws when there is nothing usable, so the caller records the file unsummarized', () => {
    expect(() => parseFileSummary('no json here')).toThrow()
    expect(() => parseFileSummary('{"intent":"","area":""}')).toThrow()
  })
})

describe('fileSummaryFeature', () => {
  it('asks for the same small answer room on every call, whatever the file', () => {
    // Unlike the plan, this answer's length is not a property of its question.
    expect(fileSummaryFeature.reservedOutputTokens?.(input)).toBe(FILE_SUMMARY_OUTPUT_TOKENS)
    expect(
      fileSummaryFeature.reservedOutputTokens?.({ ...input, diff: 'x'.repeat(50_000) })
    ).toBe(FILE_SUMMARY_OUTPUT_TOKENS)
  })

  it('runs colder than the planner, so two sibling files get the same area', () => {
    expect(fileSummaryFeature.temperature).toBeLessThan(0.2)
  })
})
