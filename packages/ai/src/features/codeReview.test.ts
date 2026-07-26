import { describe, expect, it } from 'vitest'
import type { AiContext } from '../config'
import {
  assessCodeReviewCoverage,
  buildCodeReviewPrompt,
  codeReviewFeature,
  reviewDiffBudget,
  CODE_REVIEW_INSTRUCTION,
  type CodeReviewInput,
} from './codeReview'
import { estimateTokens } from '../promptSize'

const workingContext: AiContext = {
  diff: 'working diff body',
  repoName: 'demo',
  branch: 'feat/login',
  files: [
    { path: 'src/auth/login.ts', status: 'modified' },
    { path: 'src/auth/scratch.ts', status: 'untracked' },
  ],
}

const branchContext: AiContext = {
  diff: 'range diff body',
  repoName: 'demo',
  branch: 'feat/login',
  baseRef: 'origin/main',
  files: [{ path: 'src/auth/login.ts', status: 'modified' }],
  rangeCommits: ['feat: add login form', 'test: cover the login form'],
}

function working(overrides: Partial<CodeReviewInput> = {}): CodeReviewInput {
  return { context: workingContext, scope: 'working', ...overrides }
}

function branch(overrides: Partial<CodeReviewInput> = {}): CodeReviewInput {
  return { context: branchContext, scope: 'branch', ...overrides }
}

describe('buildCodeReviewPrompt — working scope', () => {
  it('names the repo, the branch and what is under review', () => {
    const prompt = buildCodeReviewPrompt(working())
    expect(prompt).toContain('Repository: demo (branch: feat/login)')
    expect(prompt).toContain('Reviewing: uncommitted changes, before they are committed.')
  })

  it('lists the changed files with their statuses', () => {
    const prompt = buildCodeReviewPrompt(working())
    expect(prompt).toContain('- src/auth/login.ts (modified)')
    // Untracked is what lets the model flag a file left behind by accident.
    expect(prompt).toContain('- src/auth/scratch.ts (untracked)')
  })

  it('embeds the working diff under a label naming what it is against', () => {
    const prompt = buildCodeReviewPrompt(working())
    expect(prompt).toContain('--- DIFF (working tree vs HEAD) ---')
    expect(prompt).toContain('working diff body')
  })

  it('carries no branch commit list', () => {
    expect(buildCodeReviewPrompt(working())).not.toContain('Commits on this branch')
  })
})

describe('buildCodeReviewPrompt — branch scope', () => {
  it('names the branch and the base it is reviewed against', () => {
    expect(buildCodeReviewPrompt(branch())).toContain(
      'Reviewing branch: feat/login (against origin/main)'
    )
  })

  it('omits the base when the context carries none', () => {
    const prompt = buildCodeReviewPrompt(
      branch({ context: { ...branchContext, baseRef: undefined } })
    )
    expect(prompt).toContain('Reviewing branch: feat/login')
    expect(prompt).not.toContain('(against')
  })

  it("lists the branch's commits, newest first", () => {
    const prompt = buildCodeReviewPrompt(branch())
    expect(prompt).toContain('Commits on this branch (newest first):')
    expect(prompt).toContain('- feat: add login form')
  })

  it('embeds the range diff under a label naming what it is against', () => {
    const prompt = buildCodeReviewPrompt(branch())
    expect(prompt).toContain('--- DIFF (base..branch) ---')
    expect(prompt).toContain('range diff body')
  })
})

describe('buildCodeReviewPrompt — shared', () => {
  it('omits the file list when there is none', () => {
    expect(
      buildCodeReviewPrompt(working({ context: { ...workingContext, files: [] } }))
    ).not.toContain('Changed files:')
  })

  it('asks for English by default and French when the UI language is fr', () => {
    expect(buildCodeReviewPrompt(working())).toContain('Write the entire review in English.')
    expect(buildCodeReviewPrompt(branch({ language: 'fr' }))).toContain(
      'Write the entire review in French.'
    )
  })

  it('falls back to a plain cut for a diff with no file structure', () => {
    const prompt = buildCodeReviewPrompt(
      working({ context: { ...workingContext, diff: 'x'.repeat(20_000) } })
    )
    expect(prompt).toContain('[diff truncated, showing first')
  })

  it('budgets a multi-file diff per file instead of cutting it at a fixed offset', () => {
    // The regression this guards: on the changeset that introduced this feature, a blind head-cut
    // showed a doc page and two one-line edits, and not one line of the code under review.
    const bulky = (path: string, size: number) =>
      `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`
    const diff = bulky('docs/guide.md', 60_000) + bulky('src/feature.ts', 20_000)

    const prompt = buildCodeReviewPrompt(working({ context: { ...workingContext, diff } }))

    expect(prompt).toContain('src/feature.ts')
    expect(prompt).toContain('NOT INCLUDED below (budget exhausted)')
    expect(prompt).toContain('- docs/guide.md')
  })

  it('names what it could not read before the diff, not after it', () => {
    const bulky = (path: string, size: number) =>
      `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`
    const diff = bulky('src/a.ts', 20_000) + bulky('docs/b.md', 20_000)

    const prompt = buildCodeReviewPrompt(working({ context: { ...workingContext, diff } }))
    expect(prompt.indexOf('NOT INCLUDED')).toBeLessThan(prompt.indexOf('--- DIFF'))
  })

  it('closes with the actual request', () => {
    expect(buildCodeReviewPrompt(working()).trimEnd()).toMatch(/Review these changes\.$/)
  })
})

describe('reviewDiffBudget', () => {
  it('grows with the model window', () => {
    expect(reviewDiffBudget(24576)).toBeGreaterThan(reviewDiffBudget(4096))
  })

  it('leaves room for the instruction and the answer, never the whole window', () => {
    // A budget equal to the window would guarantee overflow: the instruction alone is ~1000 tokens.
    expect(reviewDiffBudget(4096)).toBeLessThan(4096 * 3.5)
  })

  it('never returns a negative budget for an absurdly small window', () => {
    expect(reviewDiffBudget(500)).toBe(0)
  })

  it('defaults to the pessimistic window when none is declared', () => {
    expect(reviewDiffBudget()).toBe(reviewDiffBudget(4096))
  })
})

describe('buildCodeReviewPrompt — sizing follows the declared window', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`
  const diff = bulky('src/a.ts', 20_000) + bulky('src/b.ts', 20_000) + bulky('src/c.ts', 20_000)

  it('sends more diff to a model with a bigger window', () => {
    const small = buildCodeReviewPrompt(
      working({ context: { ...workingContext, diff }, contextTokens: 4096 })
    )
    const large = buildCodeReviewPrompt(
      working({ context: { ...workingContext, diff }, contextTokens: 32768 })
    )
    expect(large.length).toBeGreaterThan(small.length * 3)
  })

  it('reaches files on a large window that a small one has to name as unread', () => {
    const small = buildCodeReviewPrompt(
      working({ context: { ...workingContext, diff }, contextTokens: 4096 })
    )
    const large = buildCodeReviewPrompt(
      working({ context: { ...workingContext, diff }, contextTokens: 32768 })
    )
    expect(small).toContain('NOT INCLUDED below (budget exhausted)')
    expect(large).not.toContain('NOT INCLUDED below (budget exhausted)')
  })
})

describe('buildCodeReviewPrompt — the prompt fits the window it was sized for', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  /** A changeset with enough files that the path lists stop being negligible. */
  function manyFiles(count: number) {
    const files = Array.from({ length: count }, (_, i) => ({
      path: `apps/desktop/src/components/some/deep/path/Component${i}.tsx`,
      status: 'modified',
    }))
    return { files, diff: files.map((f) => bulky(f.path, 4000)).join('') }
  }

  it.each([4096, 8192, 24576])('stays inside a %i-token window on a 50-file changeset', (window) => {
    // The regression: a flat envelope allowance ignored the file lists, which came to ~1280 tokens
    // on 50 files. The prompt then overflowed the window it had just sized itself against, and the
    // app warned the user about an overflow it had produced itself.
    const { files, diff } = manyFiles(50)
    const prompt = buildCodeReviewPrompt({
      context: { ...workingContext, files, diff },
      scope: 'working',
      contextTokens: window,
    })
    expect(estimateTokens(CODE_REVIEW_INSTRUCTION) + estimateTokens(prompt)).toBeLessThanOrEqual(
      window
    )
  })

  it('caps the changed-file list and says how many it did not print', () => {
    const { files, diff } = manyFiles(50)
    const prompt = buildCodeReviewPrompt({
      context: { ...workingContext, files, diff },
      scope: 'working',
      contextTokens: 24576,
    })
    expect(prompt).toContain('- …and 20 more')
  })

  it('caps the omitted list, which would otherwise grow as the budget shrinks', () => {
    // The feedback loop this guards: trimming the diff to fit made the omitted list longer, which
    // made the envelope bigger, which trimmed the diff further.
    const { files, diff } = manyFiles(50)
    const prompt = buildCodeReviewPrompt({
      context: { ...workingContext, files, diff },
      scope: 'working',
      contextTokens: 4096,
    })
    const omittedSection = prompt.slice(prompt.indexOf('NOT INCLUDED'), prompt.indexOf('--- DIFF'))
    expect(omittedSection.split('\n').filter((l) => l.startsWith('- ')).length).toBeLessThanOrEqual(
      13
    )
  })
})

describe('assessCodeReviewCoverage', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  it('reports a small change as fully read', () => {
    const diff = bulky('src/a.ts', 200) + bulky('src/b.ts', 200)
    const c = assessCodeReviewCoverage(
      working({ context: { ...workingContext, diff }, contextTokens: 24576 })
    )
    expect(c).toMatchObject({ filesRead: 2, filesTotal: 2, complete: true })
  })

  it('counts what a tight window had to leave out', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const c = assessCodeReviewCoverage(
      working({ context: { ...workingContext, diff }, contextTokens: 4096 })
    )
    expect(c.filesTotal).toBe(10)
    expect(c.filesRead).toBeLessThan(10)
    expect(c.complete).toBe(false)
  })

  it('names a window that would actually carry the whole diff', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessCodeReviewCoverage(
      working({ context: { ...workingContext, diff }, contextTokens: 4096 })
    )
    // The advice has to be true: re-running at the suggested window must read everything.
    const atSuggested = assessCodeReviewCoverage(
      working({ context: { ...workingContext, diff }, contextTokens: requiredContextTokens })
    )
    expect(atSuggested.complete).toBe(true)
  })

  it('rounds up to a window someone would actually configure', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessCodeReviewCoverage(
      working({ context: { ...workingContext, diff }, contextTokens: 4096 })
    )
    expect([4096, 8192, 16384, 32768, 65536, 131072, 262144]).toContain(requiredContextTokens)
  })
})

describe('codeReviewFeature', () => {
  it('is a streaming feature', () => {
    expect(codeReviewFeature.kind).toBe('streaming')
    expect(codeReviewFeature.id).toBe('code-review')
  })

  it('samples more conservatively than the descriptive features', () => {
    // A defect list that changes between runs is a reviewer nobody trusts — see the descriptor.
    expect(codeReviewFeature.temperature).toBeLessThan(0.2)
  })

  it('caps how much it may report, so the list stays readable', () => {
    expect(codeReviewFeature.instruction).toContain('AT MOST 6 bullets')
  })

  it('allows a clean verdict, so it has no reason to invent a finding', () => {
    expect(codeReviewFeature.instruction).toContain('Nothing worth flagging.')
    expect(codeReviewFeature.instruction).toContain('never manufacture a finding')
  })

  it('tells the model it is reading a diff, not the repository', () => {
    expect(codeReviewFeature.instruction).toContain('You cannot see the rest of the repository')
  })

  it('bans approval and coverage remarks from the findings list', () => {
    // Both failure modes seen in the wild: a correct change reported as a **Bug**, and "I could not
    // read the rest, please verify" reported as a **Risk**.
    expect(codeReviewFeature.instruction).toContain('approval is not a finding')
    expect(codeReviewFeature.instruction).toContain('a remark about your own coverage')
  })

  it('keeps truncation out of the verdict', () => {
    expect(codeReviewFeature.instruction).toContain('that is never the headline')
  })

  it('forbids inferring that something is missing from a narrow hunk', () => {
    // Seen in the wild: a guard sitting 4 lines above an insertion — one line outside git's 3-line
    // context — was reported as absent, which made a correct comment look like a wrong one.
    expect(codeReviewFeature.instruction).toContain('Absence of evidence is not evidence of absence')
  })
})
