import { describe, expect, it } from 'vitest'
import {
  assessCommitRecomposeCoverage,
  buildCommitRecomposePrompt,
  commitRecomposeFeature,
  COMMIT_RECOMPOSE_INSTRUCTION,
  parseRecomposedMessage,
  type CommitRecomposeInput,
} from './commitRecompose'
import { estimateTokens } from '../promptSize'

/** One file's section of a git patch, `size` chars of body. */
const section = (path: string, size: number) =>
  `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,1 @@\n+${'x'.repeat(size)}\n`

function input(overrides: Partial<CommitRecomposeInput> = {}): CommitRecomposeInput {
  return {
    repoName: 'demo',
    commit: {
      shortOid: 'abc1234',
      patch: section('src/auth/login.ts', 200),
      filesChanged: 1,
      insertions: 12,
      deletions: 3,
      isMerge: false,
    },
    ...overrides,
  }
}

describe('buildCommitRecomposePrompt', () => {
  it('identifies the commit and carries its patch', () => {
    const prompt = buildCommitRecomposePrompt(input())
    expect(prompt).toContain('abc1234')
    expect(prompt).toContain('1 files, +12/-3')
    expect(prompt).toContain('src/auth/login.ts')
  })

  it('never shows the model the message it is replacing', () => {
    // The core design decision: given the old wording, the model paraphrases and defends it instead
    // of describing the diff — which is exactly what someone asking for a rewrite does not want.
    const prompt = buildCommitRecomposePrompt(input())
    expect(prompt).not.toContain('COMMIT MESSAGE')
    expect(prompt.toLowerCase()).not.toContain('current message')
    expect(prompt.toLowerCase()).not.toContain('existing message')
  })

  it("warns when the patch is a merge's first parent only", () => {
    const merge = input()
    merge.commit.isMerge = true
    expect(buildCommitRecomposePrompt(merge)).toContain('MERGE commit')
    expect(buildCommitRecomposePrompt(input())).not.toContain('MERGE commit')
  })

  it("carries the project's own commit style so the rewrite matches its neighbours", () => {
    const prompt = buildCommitRecomposePrompt(
      input({ recentCommits: ['feat: one', 'fix: two'], commitInstructions: 'Mention the ticket' })
    )
    expect(prompt).toContain('feat: one')
    expect(prompt).toContain('Mention the ticket')
  })
})

describe('buildCommitRecomposePrompt — sizing follows the declared window', () => {
  const bulky = () =>
    input({
      commit: {
        shortOid: 'abc1234',
        patch: ['src/a.ts', 'src/b.ts', 'src/c.ts'].map((p) => section(p, 20_000)).join(''),
        filesChanged: 3,
        insertions: 900,
        deletions: 40,
        isMerge: false,
      },
    })

  it.each([4096, 8192, 24576])('stays inside a %i-token window', (window) => {
    const prompt = buildCommitRecomposePrompt({ ...bulky(), contextTokens: window })
    expect(
      estimateTokens(COMMIT_RECOMPOSE_INSTRUCTION) + estimateTokens(prompt)
    ).toBeLessThanOrEqual(window)
  })

  it('sends more of the patch to a model with a bigger window', () => {
    const small = buildCommitRecomposePrompt({ ...bulky(), contextTokens: 4096 })
    const large = buildCommitRecomposePrompt({ ...bulky(), contextTokens: 32768 })
    expect(large.length).toBeGreaterThan(small.length * 3)
  })

  it('names what it could not read before the diff, not after it', () => {
    const prompt = buildCommitRecomposePrompt({ ...bulky(), contextTokens: 4096 })
    expect(prompt.indexOf('NOT INCLUDED')).toBeLessThan(prompt.indexOf('--- DIFF ---'))
  })

  it('says nothing about omitted files when the whole patch fits', () => {
    expect(buildCommitRecomposePrompt({ ...input(), contextTokens: 32768 })).not.toContain(
      'NOT INCLUDED'
    )
  })
})

describe('assessCommitRecomposeCoverage', () => {
  const many = (count: number) =>
    input({
      commit: {
        shortOid: 'abc1234',
        patch: Array.from({ length: count }, (_, i) => section(`src/f${i}.ts`, 5000)).join(''),
        filesChanged: count,
        insertions: 100,
        deletions: 10,
        isMerge: false,
      },
    })

  it('reports a small commit as fully read', () => {
    expect(assessCommitRecomposeCoverage({ ...input(), contextTokens: 24576 })).toMatchObject({
      filesRead: 1,
      filesTotal: 1,
      complete: true,
    })
  })

  it('counts what a tight window had to leave out', () => {
    const coverage = assessCommitRecomposeCoverage({ ...many(10), contextTokens: 4096 })
    expect(coverage.filesTotal).toBe(10)
    expect(coverage.filesRead).toBeLessThan(10)
    expect(coverage.complete).toBe(false)
  })

  it('names a window that would actually carry the whole commit', () => {
    const { requiredContextTokens } = assessCommitRecomposeCoverage({
      ...many(10),
      contextTokens: 4096,
    })
    expect(
      assessCommitRecomposeCoverage({ ...many(10), contextTokens: requiredContextTokens }).complete
    ).toBe(true)
  })
})

describe('parseRecomposedMessage', () => {
  it('returns a clean message untouched', () => {
    expect(parseRecomposedMessage('feat(auth): add token refresh')).toBe(
      'feat(auth): add token refresh'
    )
  })

  it('keeps a body, and the blank line before it', () => {
    expect(parseRecomposedMessage('feat: x\n\nBecause y.\n')).toBe('feat: x\n\nBecause y.')
  })

  it('strips a code fence the instruction forbade', () => {
    // Permanent if it survives: this text is written into history.
    expect(parseRecomposedMessage('```\nfeat: x\n```')).toBe('feat: x')
    expect(parseRecomposedMessage('```text\nfeat: x\n\nBody.\n```')).toBe('feat: x\n\nBody.')
  })

  it('strips quotes only when they wrap the whole message', () => {
    expect(parseRecomposedMessage('"feat: x"')).toBe('feat: x')
    // A quoted identifier inside a subject must survive.
    expect(parseRecomposedMessage('fix: handle "null" ids')).toBe('fix: handle "null" ids')
  })

  it('tolerates an empty answer rather than inventing one', () => {
    expect(parseRecomposedMessage('   ')).toBe('')
  })
})

describe('commitRecomposeFeature', () => {
  it('forbids narrating the rewrite itself', () => {
    // The failure this guards: "reword: add token refresh", or a body explaining that the message
    // was regenerated — permanently, in the repository's history.
    expect(commitRecomposeFeature.instruction).toContain('Never mention rewording')
  })

  it('keeps truncation out of a message that replaces a real one', () => {
    expect(commitRecomposeFeature.instruction).toContain('NEVER mention truncation')
    expect(commitRecomposeFeature.instruction).toContain('REPLACES the commit')
  })

  it('is a completion, because the review dialog is the interaction', () => {
    expect(commitRecomposeFeature.kind).toBe('completion')
    expect(commitRecomposeFeature.parse('```\nfeat: x\n```')).toBe('feat: x')
  })

  it('declares no custom output reserve — a commit message is prose', () => {
    expect(commitRecomposeFeature.reservedOutputTokens).toBeUndefined()
  })
})
