import { describe, expect, it } from 'vitest'
import {
  assessCommitExplanationCoverage,
  buildCommitExplanationPrompt,
  commitExplanationFeature,
  COMMIT_EXPLANATION_INSTRUCTION,
  type CommitExplanationInput,
} from './commitExplanation'
import { estimateTokens } from '../promptSize'

function input(overrides: Partial<CommitExplanationInput> = {}): CommitExplanationInput {
  return {
    repoName: 'demo',
    commit: {
      shortOid: 'abc1234',
      subject: 'feat: add login page',
      body: '',
      author: 'Ada',
      filesChanged: 3,
      insertions: 40,
      deletions: 2,
      isMerge: false,
    },
    patch: '@@ -1 +1 @@\n-old\n+new',
    ...overrides,
  }
}

describe('buildCommitExplanationPrompt', () => {
  it('names the commit, its author and its change volume', () => {
    const prompt = buildCommitExplanationPrompt(input())
    expect(prompt).toContain('Repository: demo')
    expect(prompt).toContain('Commit: abc1234 by Ada (3 files, +40/-2)')
  })

  it('includes the commit message so the model can go beyond it', () => {
    const prompt = buildCommitExplanationPrompt(input())
    expect(prompt).toContain('--- COMMIT MESSAGE ---')
    expect(prompt).toContain('feat: add login page')
  })

  it('appends the body when there is one', () => {
    const prompt = buildCommitExplanationPrompt(
      input({ commit: { ...input().commit, body: 'Closes #12.\nAlso tidies the form.' } })
    )
    expect(prompt).toContain('Closes #12.')
    expect(prompt).toContain('Also tidies the form.')
  })

  it('trims a long body, which is envelope displacing diff one-for-one', () => {
    // A good commit message is not small: the one that introduced the code review runs to 3106
    // characters — 888 tokens, a fifth of a stock 4096-token window — and the prompt was sending all
    // of it, then instructing the model not to follow it.
    const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} of the rationale.`).join(
      '\n\n'
    )
    const prompt = buildCommitExplanationPrompt(
      input({ commit: { ...input().commit, body: long } })
    )

    expect(prompt).toContain('Paragraph 0 of the rationale.')
    expect(prompt).not.toContain('Paragraph 39 of the rationale.')
    // The subject is never a casualty of that.
    expect(prompt).toContain('feat: add login page')
  })

  it('cuts the body on a paragraph break, and says nothing about having cut it', () => {
    // A visible truncation marker would re-arm the coverage remark the instruction bans: the model
    // is told never to discuss what it could not read, and a marker is an invitation to discuss it.
    const long = `${'a'.repeat(1000)}\n\n${'b'.repeat(1000)}\n\n${'c'.repeat(1000)}`
    const prompt = buildCommitExplanationPrompt(
      input({ commit: { ...input().commit, body: long } })
    )

    expect(prompt).toContain('a'.repeat(1000))
    expect(prompt).not.toContain('c'.repeat(1000))
    expect(prompt).not.toMatch(/omitted|truncated|\[…/)
    // Cut at the break, so what remains reads as a message rather than a severed sentence.
    expect(prompt).toContain(`${'a'.repeat(1000)}\n--- END COMMIT MESSAGE ---`)
  })

  it('falls back to a hard cut when the body offers no usable break', () => {
    const long = 'x'.repeat(4000)
    const prompt = buildCommitExplanationPrompt(
      input({ commit: { ...input().commit, body: long } })
    )
    expect(prompt).toContain(`${'x'.repeat(1200)}\n--- END COMMIT MESSAGE ---`)
  })

  it('omits an empty or whitespace-only body cleanly', () => {
    const prompt = buildCommitExplanationPrompt(
      input({ commit: { ...input().commit, body: '   \n ' } })
    )
    expect(prompt).toContain('feat: add login page\n--- END COMMIT MESSAGE ---')
  })

  it('embeds the patch', () => {
    const prompt = buildCommitExplanationPrompt(input())
    expect(prompt).toContain('--- DIFF ---')
    expect(prompt).toContain('+new')
  })

  it('warns the model that a merge diff is first-parent only', () => {
    const prompt = buildCommitExplanationPrompt(
      input({ commit: { ...input().commit, isMerge: true } })
    )
    expect(prompt).toContain('MERGE commit')
    expect(prompt).toContain('first parent only')
  })

  it('says nothing about merges for an ordinary commit', () => {
    expect(buildCommitExplanationPrompt(input())).not.toContain('MERGE commit')
  })

  it('asks for English by default and French when the UI language is fr', () => {
    expect(buildCommitExplanationPrompt(input())).toContain(
      'Write the entire explanation in English.'
    )
    expect(buildCommitExplanationPrompt(input({ language: 'fr' }))).toContain(
      'Write the entire explanation in French.'
    )
  })

  it('falls back to a plain cut for a patch with no file structure', () => {
    const prompt = buildCommitExplanationPrompt(input({ patch: 'x'.repeat(20_000) }))
    expect(prompt).toContain('[diff truncated, showing first')
  })

  it('closes with the actual request', () => {
    expect(buildCommitExplanationPrompt(input()).trimEnd()).toMatch(
      /Explain what this commit does\.$/
    )
  })
})

describe('buildCommitExplanationPrompt — sizing follows the declared window', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`
  const patch = bulky('src/a.ts', 20_000) + bulky('src/b.ts', 20_000) + bulky('src/c.ts', 20_000)

  it('sends more of the patch to a model with a bigger window', () => {
    const small = buildCommitExplanationPrompt(input({ patch, contextTokens: 4096 }))
    const large = buildCommitExplanationPrompt(input({ patch, contextTokens: 32768 }))
    expect(large.length).toBeGreaterThan(small.length * 3)
  })

  it.each([4096, 8192, 24576])('stays inside a %i-token window', (window) => {
    // The bug this replaces: a flat 8000-character cut ignored the window entirely, so a stock
    // Ollama got a prompt that overflowed — dropping tokens from the start, where the instruction is.
    const prompt = buildCommitExplanationPrompt(input({ patch, contextTokens: window }))
    expect(
      estimateTokens(COMMIT_EXPLANATION_INSTRUCTION) + estimateTokens(prompt)
    ).toBeLessThanOrEqual(window)
  })

  it('pays for a long commit message out of the diff, not out of the window', () => {
    // A squashed merge's body runs to hundreds of tokens. Measured rather than assumed, it costs
    // the diff a few files; assumed flat, it costs the instruction — silently, from the start.
    const diffPart = (p: string) => p.slice(p.indexOf('--- DIFF ---'))
    const long = buildCommitExplanationPrompt(
      input({ patch, contextTokens: 8192, commit: { ...input().commit, body: 'x'.repeat(6000) } })
    )
    const short = buildCommitExplanationPrompt(input({ patch, contextTokens: 8192 }))

    expect(diffPart(long).length).toBeLessThan(diffPart(short).length)
    expect(
      estimateTokens(COMMIT_EXPLANATION_INSTRUCTION) + estimateTokens(long)
    ).toBeLessThanOrEqual(8192)
  })

  it('reads the code before the noise instead of cutting at a fixed offset', () => {
    // The regression this guards, ported from the code review: a blind head-cut spends the whole
    // budget on whatever sorts first — a lockfile or a doc page — and never reaches the code.
    const noisy = bulky('pnpm-lock.yaml', 60_000) + bulky('src/feature.ts', 4000)
    const prompt = buildCommitExplanationPrompt(input({ patch: noisy, contextTokens: 8192 }))

    // The source file arrives whole, and the lockfile is the one that pays for it.
    expect(prompt).toContain(`+${'x'.repeat(4000)}`)
    expect(prompt).toContain('[... pnpm-lock.yaml: truncated')
  })

  it('names what it could not read before the diff, not after it', () => {
    const prompt = buildCommitExplanationPrompt(input({ patch, contextTokens: 4096 }))
    expect(prompt.indexOf('NOT INCLUDED')).toBeLessThan(prompt.indexOf('--- DIFF ---'))
  })

  it('says nothing about omitted files when the whole patch fits', () => {
    expect(buildCommitExplanationPrompt(input({ contextTokens: 32768 }))).not.toContain(
      'NOT INCLUDED'
    )
  })
})

describe('buildCommitExplanationPrompt — the changed-file list', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  const files = [
    { path: 'src/a.ts', status: 'modified', insertions: 12, deletions: 3 },
    { path: 'src/b.ts', status: 'added', insertions: 40, deletions: 0 },
    { path: 'docs/c.md', status: 'modified', insertions: 5, deletions: 5 },
  ]

  it('groups files by directory, with their line counts', () => {
    const prompt = buildCommitExplanationPrompt(input({ files }))
    expect(prompt).toContain('--- CHANGED FILES (3, complete) ---')
    // Grouped: the shared prefix is paid once, and the shape the answer should be about is visible.
    expect(prompt).toContain('src/ — a.ts (+12/-3), b.ts (added, +40/-0)')
    expect(prompt).toContain('docs/ — c.md (+5/-5)')
  })

  it("leaves 'modified' implicit and spells out anything else", () => {
    // The overwhelming default, repeated once per file, is pure envelope cost.
    const prompt = buildCommitExplanationPrompt(input({ files }))
    expect(prompt).not.toContain('modified')
    expect(prompt).toContain('added')
  })

  it('stays complete when the diff is not — the point of sending it at all', () => {
    // The failure this fixes: a 21-file commit of which 6 were read came back as a per-file
    // inventory of those 6, because nothing in the prompt described the other 15.
    const many = Array.from({ length: 21 }, (_, i) => ({
      path: `src/f${i}.ts`,
      status: 'modified',
      insertions: 10,
      deletions: 2,
    }))
    const patch = many.map((f) => bulky(f.path, 5000)).join('')
    const prompt = buildCommitExplanationPrompt(input({ files: many, patch, contextTokens: 4096 }))

    expect(prompt).toContain('--- CHANGED FILES (21, complete) ---')
    // Every file the budget dropped is still named, marked rather than absent.
    expect(prompt).toContain('diff not shown')
    expect(prompt).toContain('f20.ts')
  })

  it('marks a shortened file differently from a dropped one', () => {
    const patch = bulky('src/a.ts', 200) + bulky('src/big.ts', 60_000)
    const prompt = buildCommitExplanationPrompt(
      input({
        patch,
        contextTokens: 8192,
        files: [
          { path: 'src/a.ts', status: 'modified', insertions: 1, deletions: 1 },
          { path: 'src/big.ts', status: 'modified', insertions: 900, deletions: 0 },
        ],
      })
    )
    expect(prompt).toContain('a.ts (+1/-1)')
    expect(prompt).toContain('big.ts (+900/-0, shortened)')
  })

  it('carries no second list of the same paths', () => {
    // One list, marked in place. Two would say every dropped path twice and turn coverage into a
    // topic of its own — which is exactly what the answer must not be about.
    const many = Array.from({ length: 21 }, (_, i) => ({
      path: `src/f${i}.ts`,
      status: 'modified',
      insertions: 10,
      deletions: 2,
    }))
    const patch = many.map((f) => bulky(f.path, 5000)).join('')
    const prompt = buildCommitExplanationPrompt(input({ files: many, patch, contextTokens: 4096 }))
    expect(prompt).not.toContain('NOT INCLUDED')
  })

  it('collapses a long tail to directory counts instead of dropping it', () => {
    // The bug this fixes: a plain "…and 18 more files" is a remainder with no paths, and the model
    // is told to account for every file — so it described those 18 using files it had actually seen
    // listed above. Nothing invented, and the sentence still false.
    const many = [
      ...Array.from({ length: 25 }, (_, i) => ({
        path: `src/f${i}.ts`,
        status: 'modified',
        insertions: 1,
        deletions: 1,
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        path: `packages/i18n/locales/l${i}.json`,
        status: 'modified',
        insertions: 3,
        deletions: 2,
      })),
    ]
    const prompt = buildCommitExplanationPrompt(input({ files: many }))

    expect(prompt).toContain('--- CHANGED FILES (45, complete) ---')
    expect(prompt).toContain('src/ — f0.ts')
    // The tail is still there, at directory granularity and with honest totals.
    expect(prompt).toContain('packages/i18n/locales/ — 20 files (+60/-40)')
    expect(prompt).not.toContain('more files')
  })

  it('never half-lists a directory, which would read as a complete one', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      path: `src/f${i}.ts`,
      status: 'modified',
      insertions: 1,
      deletions: 1,
    }))
    const prompt = buildCommitExplanationPrompt(input({ files: many }))
    expect(prompt).toContain('src/ — 40 files (+40/-40)')
    expect(prompt).not.toContain('f0.ts (')
  })

  it('admits to a remainder only when the tree itself is pathological', () => {
    // 50 files in 50 distinct directories: 30 named, 15 collapsed, and only then a remainder. The
    // one case where the list cannot stay complete — and it is the tree's doing, not the cap's.
    const many = Array.from({ length: 50 }, (_, i) => ({
      path: `pkg${i}/src/deep/f.ts`,
      status: 'modified',
      insertions: 1,
      deletions: 1,
    }))
    const prompt = buildCommitExplanationPrompt(input({ files: many }))
    expect(prompt).toContain('…and 5 more files, elsewhere in the tree')
  })

  it('costs the diff its own size, so the prompt still fits the window', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      path: `apps/desktop/src/components/deep/path/Component${i}.tsx`,
      status: 'modified',
      insertions: 10,
      deletions: 2,
    }))
    const patch = many.map((f) => bulky(f.path, 4000)).join('')
    const prompt = buildCommitExplanationPrompt(input({ files: many, patch, contextTokens: 8192 }))
    expect(
      estimateTokens(COMMIT_EXPLANATION_INSTRUCTION) + estimateTokens(prompt)
    ).toBeLessThanOrEqual(8192)
  })

  it('omits the list entirely when the caller has none', () => {
    expect(buildCommitExplanationPrompt(input())).not.toContain('CHANGED FILES')
  })
})

describe('assessCommitExplanationCoverage', () => {
  const bulky = (path: string, size: number) =>
    `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  it('reports a small commit as fully read', () => {
    const patch = bulky('src/a.ts', 200) + bulky('src/b.ts', 200)
    expect(assessCommitExplanationCoverage(input({ patch, contextTokens: 24576 }))).toMatchObject({
      filesRead: 2,
      filesTotal: 2,
      complete: true,
    })
  })

  it('counts what a tight window had to leave out of a large commit', () => {
    const patch = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const coverage = assessCommitExplanationCoverage(input({ patch, contextTokens: 4096 }))
    expect(coverage.filesTotal).toBe(10)
    expect(coverage.filesRead).toBeLessThan(10)
    expect(coverage.complete).toBe(false)
  })

  it('counts the files the commit has, not the headers it could re-parse', () => {
    // The bug: the panel said "6 of 21" on a commit git counts 26 files for, because the total was
    // re-derived by scanning the patch text instead of taken from the inventory the prompt sends.
    const patch = bulky('src/a.ts', 200)
    const files = Array.from({ length: 26 }, (_, i) => ({
      path: `src/f${i}.ts`,
      status: 'modified',
      insertions: 1,
      deletions: 1,
    }))
    const coverage = assessCommitExplanationCoverage(input({ patch, files, contextTokens: 24576 }))
    expect(coverage.filesTotal).toBe(26)
  })

  it('keeps what budgeting knows — how many files it had to drop', () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      path: `src/f${i}.ts`,
      status: 'modified',
      insertions: 1,
      deletions: 1,
    }))
    const patch = files.map((f) => bulky(f.path, 5000)).join('')
    const withList = assessCommitExplanationCoverage(input({ patch, files, contextTokens: 4096 }))
    const withoutList = assessCommitExplanationCoverage(input({ patch, contextTokens: 4096 }))
    // Same patch, same budget, so the same number of files went unread either way.
    expect(withList.filesTotal - withList.filesRead).toBe(
      withoutList.filesTotal - withoutList.filesRead
    )
  })

  it('names a window that would actually carry the whole commit', () => {
    const patch = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessCommitExplanationCoverage(
      input({ patch, contextTokens: 4096 })
    )
    expect(
      assessCommitExplanationCoverage(input({ patch, contextTokens: requiredContextTokens }))
        .complete
    ).toBe(true)
  })
})

describe('commitExplanationFeature', () => {
  it('is a streaming feature with a low, grounded temperature', () => {
    expect(commitExplanationFeature.kind).toBe('streaming')
    expect(commitExplanationFeature.temperature).toBeLessThanOrEqual(0.3)
  })

  it('forbids paraphrasing the commit message back', () => {
    expect(commitExplanationFeature.instruction).toContain('Do NOT paraphrase it back')
  })

  it('forbids inferring that something is missing from a narrow hunk', () => {
    expect(commitExplanationFeature.instruction).toContain(
      'Absence of evidence is not evidence of absence'
    )
  })

  it('bans every mention of what it could not read', () => {
    // Stricter than the code review, which is merely asked to keep its coverage line short. An
    // explanation claims nothing that a missing file would undermine, and the panel reports
    // coverage exactly — so prose about it is pure loss against a 250-word budget.
    expect(commitExplanationFeature.instruction).toContain(
      'NEVER mention truncation, budgets, or what you could not read'
    )
  })

  it('bans the file-by-file inventory a partial diff invites', () => {
    expect(commitExplanationFeature.instruction).toContain(
      'Bullets are about CHANGES, never about files one by one'
    )
  })

  it('tells the model the file list is complete even when the diff is not', () => {
    expect(commitExplanationFeature.instruction).toContain('the COMPLETE list of every file')
    expect(commitExplanationFeature.instruction).toContain('diff not shown')
  })

  it('makes "do not paraphrase" a gradient rather than a prohibition', () => {
    // Starved of diff, the richest text left in the prompt is the message — so a detailed message
    // is exactly when the model is most tempted to summarize it, and least allowed to.
    expect(commitExplanationFeature.instruction).toContain(
      'the MORE detailed the message, the LESS of it you may follow'
    )
  })

  it('requires one bullet the message cannot account for', () => {
    // The obligation that makes the rule above checkable: on a three-paragraph message, all four
    // bullets tracked those paragraphs and the 45 lines deleted from an unmentioned file did not
    // appear at all.
    expect(commitExplanationFeature.instruction).toContain(
      'At least ONE bullet must carry something the message never mentions'
    )
  })
})
