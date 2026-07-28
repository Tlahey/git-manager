import { describe, it, expect } from 'vitest'
import {
  buildCommitRelevancePrompt,
  commitRelevanceFeature,
  COMMIT_RELEVANCE_INSTRUCTION,
  COMMIT_RELEVANCE_OUTPUT_TOKENS,
  COMMIT_RELEVANCE_SCHEMA,
  CommitVerdictUnreadable,
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
  /**
   * The order is load-bearing, not cosmetic: a model fills the fields as it writes them, so the
   * decision has to come after the evidence for it. With `relevant` first, the observed failure was
   * a summary of the commit with `relevant: true` attached.
   */
  it('asks for the evidence before the verdict', () => {
    const schema = COMMIT_RELEVANCE_SCHEMA.schema as {
      properties: Record<string, unknown>
      required: string[]
    }
    expect(Object.keys(schema.properties)).toEqual([
      'subject',
      'evidence',
      'relevant',
      'finding',
      'files',
    ])
    expect(schema.required).toEqual(['subject', 'evidence', 'relevant', 'finding', 'files'])
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

  it('states that false is the default answer', () => {
    expect(COMMIT_RELEVANCE_INSTRUCTION).toMatch(/the default answer is false/i)
  })

  /** The exact false positive users hit: a menu entry matched a question about a button. */
  it('rules out "same area, similar word" matches by example', () => {
    expect(COMMIT_RELEVANCE_INSTRUCTION).toMatch(/menu entry, an icon, a panel or a dialog/i)
  })

  it('forbids describing the commit instead of answering', () => {
    expect(COMMIT_RELEVANCE_INSTRUCTION).toMatch(/do not describe the commit/i)
  })
})

describe('parseCommitRelevance', () => {
  const positive = JSON.stringify({
    subject: 'composant bouton',
    evidence: 'packages/ui/src/Button.tsx: added a `loading` prop',
    relevant: true,
    finding: 'adds a loading state',
    files: ['packages/ui/src/Button.tsx'],
  })

  it('reads a positive verdict', () => {
    expect(parseCommitRelevance(positive)).toEqual({
      relevant: true,
      finding: 'adds a loading state',
      files: ['packages/ui/src/Button.tsx'],
    })
  })

  it('tolerates prose and fences around the object', () => {
    const raw = `Here:\n\`\`\`json\n${positive}\n\`\`\`\nHope that helps.`
    expect(parseCommitRelevance(raw).relevant).toBe(true)
  })

  it('accepts the string "true" some providers emit under a loose schema', () => {
    const raw = positive.replace('"relevant":true', '"relevant":"true"')
    expect(parseCommitRelevance(raw).relevant).toBe(true)
  })

  /**
   * The gate that removes the observed failure: a commit was matched for being vaguely in the same
   * area, with a summary of it pasted into `finding`. No element of *this* diff, no match.
   */
  it('rejects a match backed by no evidence from the diff', () => {
    const raw = JSON.stringify({
      subject: 'composant bouton',
      evidence: '',
      relevant: true,
      finding: 'Ce commit introduit une approche en deux phases pour planifier les commits.',
      files: ['packages/ai/src/features/planCommits.ts'],
    })
    expect(parseCommitRelevance(raw)).toEqual({ relevant: false, finding: '', files: [] })
  })

  it('treats "none" and its friends as no evidence at all', () => {
    // How a model writes an empty field when the schema forbids omitting it.
    for (const evidence of ['none', 'N/A', 'aucune', '-', 'null']) {
      const raw = positive.replace('packages/ui/src/Button.tsx: added a `loading` prop', evidence)
      expect(parseCommitRelevance(raw).relevant).toBe(false)
    }
  })

  it('drops a "relevant" verdict the model could not describe', () => {
    // Otherwise the answer names a commit with nothing to say about it, which reads as an
    // unexplained accusation against the user's own history.
    const raw = positive.replace('"finding":"adds a loading state"', '"finding":"  "')
    expect(parseCommitRelevance(raw)).toEqual({ relevant: false, finding: '', files: [] })
  })

  it('clears the finding and files of a negative verdict', () => {
    const raw = JSON.stringify({
      subject: 'composant bouton',
      evidence: '',
      relevant: false,
      finding: 'nothing here',
      files: ['a'],
    })
    expect(parseCommitRelevance(raw)).toEqual({ relevant: false, finding: '', files: [] })
  })

  /**
   * Ollama's OpenAI-compatible endpoint drops `response_format` for some models and answers in
   * labelled prose. Without this, that provider does not degrade the search — it makes EVERY commit
   * unreadable.
   */
  it('reads a verdict a provider wrote as labelled prose', () => {
    const raw = [
      'subject: composant bouton',
      'evidence: packages/ui/src/components/button.tsx now reads --control-radius',
      'relevant: true',
      'finding: Le bouton utilise désormais une variable CSS pour son rayon.',
      'files:',
      '- packages/ui/src/components/button.tsx',
    ].join('\n')

    expect(parseCommitRelevance(raw)).toEqual({
      relevant: true,
      finding: 'Le bouton utilise désormais une variable CSS pour son rayon.',
      files: ['packages/ui/src/components/button.tsx'],
    })
  })

  it('reads a prose negative, markdown emphasis and all', () => {
    const raw = '- **subject**: bouton\n- **evidence**:\n- **relevant**: false\n- **finding**:'
    expect(parseCommitRelevance(raw)).toEqual({ relevant: false, finding: '', files: [] })
  })

  it('holds prose to the same evidence rule as JSON', () => {
    const raw = 'subject: bouton\nevidence:\nrelevant: true\nfinding: Ce commit fait autre chose.'
    expect(parseCommitRelevance(raw).relevant).toBe(false)
  })

  it('throws a typed error on an unusable response, so the caller can say why', () => {
    // A failed call must not become a clean "no": that turns a provider hiccup into a confident
    // negative in the final answer.
    expect(() => parseCommitRelevance('')).toThrow(CommitVerdictUnreadable)
    expect(() => parseCommitRelevance('   ')).toThrow(CommitVerdictUnreadable)
    expect(() => parseCommitRelevance('the model was busy')).toThrow(CommitVerdictUnreadable)
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
