import { describe, it, expect } from 'vitest'
import {
  buildCommitRelevancePrompt,
  commitRelevanceFeature,
  COMMIT_RELEVANCE_INSTRUCTION,
  COMMIT_RELEVANCE_OUTPUT_TOKENS,
  COMMIT_RELEVANCE_SCHEMA,
  parseCommitRelevance,
  type CommitRelevanceInput,
} from './commitRelevance'

const input: CommitRelevanceInput = {
  question: 'Has the Button component changed recently?',
  commit: {
    shortOid: 'abc1234',
    subject: 'feat(ui): add a loading state to Button',
    body: 'Replaces the old spinner prop.',
    author: 'Ada',
    // 2026-07-14T00:00:00Z
    timestamp: 1_783_987_200,
  },
  files: [{ path: 'packages/ui/src/Button.tsx', status: 'modified' }],
  diff: 'diff --git a/packages/ui/src/Button.tsx b/packages/ui/src/Button.tsx\n+const loading = true',
}

describe('buildCommitRelevancePrompt', () => {
  it('puts the question, the commit and its files in front of the diff', () => {
    const prompt = buildCommitRelevancePrompt(input)
    expect(prompt).toContain('Has the Button component changed recently?')
    expect(prompt).toContain('abc1234')
    expect(prompt).toContain('feat(ui): add a loading state to Button')
    expect(prompt).toContain('Replaces the old spinner prop.')
    expect(prompt).toContain('- packages/ui/src/Button.tsx (modified)')
    expect(prompt).toContain('+const loading = true')
  })

  it('dates the commit, because "recently" is what is being asked', () => {
    expect(buildCommitRelevancePrompt(input)).toContain('2026-07-14')
  })

  it('names the language the finding must be written in', () => {
    expect(buildCommitRelevancePrompt({ ...input, language: 'fr' })).toContain('French')
  })

  it('fits a small window whatever the commit weighs — one commit is all it carries', () => {
    const huge = { ...input, diff: 'x'.repeat(200_000), contextTokens: 4096 }
    const prompt = buildCommitRelevancePrompt(huge)
    expect(prompt.length).toBeLessThan(4096 * 3.5)
    expect(prompt).toContain('Has the Button component changed recently?')
  })

  it('survives a commit with no body and no files', () => {
    const bare = { ...input, commit: { ...input.commit, body: '' }, files: [] }
    const prompt = buildCommitRelevancePrompt(bare)
    expect(prompt).toContain('(none)')
    expect(prompt).not.toContain('Body:')
  })
})

describe('COMMIT_RELEVANCE_SCHEMA', () => {
  it('constrains the verdict to the three fields it is read for', () => {
    const schema = COMMIT_RELEVANCE_SCHEMA.schema as { properties: Record<string, unknown> }
    expect(Object.keys(schema.properties).sort()).toEqual(['files', 'finding', 'relevant'])
    expect(COMMIT_RELEVANCE_SCHEMA.strict).toBe(true)
  })
})

describe('COMMIT_RELEVANCE_INSTRUCTION', () => {
  it('forbids inventing a path, since the panel turns those into links', () => {
    expect(COMMIT_RELEVANCE_INSTRUCTION).toMatch(/never invent a path/i)
  })

  it('scopes the model to this one commit rather than the whole question', () => {
    expect(COMMIT_RELEVANCE_INSTRUCTION).toMatch(/do not answer the question overall/i)
  })
})

describe('parseCommitRelevance', () => {
  it('reads a positive verdict', () => {
    expect(
      parseCommitRelevance(
        '{"relevant":true,"finding":"adds a loading state","files":["packages/ui/src/Button.tsx"]}'
      )
    ).toEqual({
      relevant: true,
      finding: 'adds a loading state',
      files: ['packages/ui/src/Button.tsx'],
    })
  })

  it('tolerates prose and fences around the object', () => {
    const raw = 'Here:\n```json\n{"relevant":false,"finding":"","files":[]}\n```'
    expect(parseCommitRelevance(raw)).toEqual({ relevant: false, finding: '', files: [] })
  })

  it('accepts the string "true" some providers emit under a loose schema', () => {
    expect(parseCommitRelevance('{"relevant":"true","finding":"touches it","files":[]}')).toEqual({
      relevant: true,
      finding: 'touches it',
      files: [],
    })
  })

  it('drops a "relevant" verdict the model could not describe', () => {
    // Otherwise the answer names a commit with nothing to say about it, which reads as an
    // unexplained accusation against the user's own history.
    expect(parseCommitRelevance('{"relevant":true,"finding":"  ","files":["a"]}')).toEqual({
      relevant: false,
      finding: '',
      files: [],
    })
  })

  it('clears the finding and files of a negative verdict', () => {
    expect(
      parseCommitRelevance('{"relevant":false,"finding":"nothing here","files":["a"]}')
    ).toEqual({ relevant: false, finding: '', files: [] })
  })

  it('throws on an unusable response, so the caller records the commit as unread', () => {
    // A failed call must not become a clean "no": that turns a provider hiccup into a confident
    // negative in the final answer.
    expect(() => parseCommitRelevance('the model was busy')).toThrow()
    expect(() => parseCommitRelevance('{oops')).toThrow()
  })
})

describe('commitRelevanceFeature', () => {
  it('asks for the same answer room on every commit', () => {
    expect(commitRelevanceFeature.reservedOutputTokens?.(input)).toBe(
      COMMIT_RELEVANCE_OUTPUT_TOKENS
    )
  })

  it('runs cold, so the same commit does not flip sides across a run', () => {
    expect(commitRelevanceFeature.temperature).toBeLessThanOrEqual(0.1)
  })
})
