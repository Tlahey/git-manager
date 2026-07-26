import { describe, expect, it } from 'vitest'
import {
  assessChangeExplanationCoverage,
  buildChangeExplanationPrompt,
  changeExplanationFeature,
  CHANGE_EXPLANATION_INSTRUCTION,
  type ChangeExplanationInput,
} from './changeExplanation'
import { estimateTokens } from '../promptSize'

function input(overrides: Partial<ChangeExplanationInput> = {}): ChangeExplanationInput {
  return {
    repoName: 'demo',
    file: {
      path: 'src/auth/login.ts',
      status: 'modified',
      patch: '@@ -1,2 +1,3 @@\n ctx\n-old line\n+new line',
      additions: 1,
      deletions: 1,
    },
    fileContent: 'export function login() {}',
    ...overrides,
  }
}

describe('buildChangeExplanationPrompt', () => {
  it('includes the repo, the file identity and its change volume', () => {
    const prompt = buildChangeExplanationPrompt(input())
    expect(prompt).toContain('Repository: demo')
    expect(prompt).toContain('File: src/auth/login.ts (modified, +1/-1)')
  })

  it('embeds the patch to explain', () => {
    const prompt = buildChangeExplanationPrompt(input())
    expect(prompt).toContain('--- PATCH ---')
    expect(prompt).toContain('+new line')
  })

  it('embeds the file content as the context the change is read against', () => {
    const prompt = buildChangeExplanationPrompt(input())
    expect(prompt).toContain('--- CURRENT FILE CONTENT (context for the change) ---')
    expect(prompt).toContain('export function login() {}')
  })

  it('states the content is unavailable rather than staying silent about it', () => {
    const prompt = buildChangeExplanationPrompt(input({ fileContent: undefined }))
    expect(prompt).not.toContain('--- CURRENT FILE CONTENT')
    expect(prompt).toContain("The file's content is not available")
  })

  it('treats whitespace-only content as no content', () => {
    const prompt = buildChangeExplanationPrompt(input({ fileContent: '  \n  ' }))
    expect(prompt).toContain("The file's content is not available")
  })

  it('asks for English by default and for French when the UI language is fr', () => {
    expect(buildChangeExplanationPrompt(input())).toContain(
      'Write the entire explanation in English.'
    )
    expect(buildChangeExplanationPrompt(input({ language: 'fr' }))).toContain(
      'Write the entire explanation in French.'
    )
  })

  it('cuts an oversized patch and an oversized file content out of one shared budget', () => {
    // They used to be two independent 8000-character cuts — 16 000 characters of variable content,
    // ~4600 tokens, against a stock 4096-token window, with the sum never checked against anything.
    const prompt = buildChangeExplanationPrompt(
      input({
        file: { ...input().file, patch: 'x'.repeat(20_000) },
        fileContent: 'y'.repeat(20_000),
      })
    )
    expect(prompt).toContain('[diff truncated, showing first')
    expect(prompt).toContain('[file truncated, showing first')
  })
})

describe('changeExplanationFeature', () => {
  it('is a streaming feature with a low, grounded temperature', () => {
    expect(changeExplanationFeature.kind).toBe('streaming')
    expect(changeExplanationFeature.temperature).toBeGreaterThan(0)
    expect(changeExplanationFeature.temperature).toBeLessThanOrEqual(0.3)
  })

  it('builds its prompt from the input', () => {
    expect(changeExplanationFeature.buildPrompt(input())).toContain('src/auth/login.ts')
  })
})

describe('buildChangeExplanationPrompt — sizing follows the declared window', () => {
  const patchOf = (size: number) =>
    `diff --git a/src/auth/login.ts b/src/auth/login.ts\n--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  const big = (overrides: Partial<ChangeExplanationInput> = {}) =>
    input({
      file: { ...input().file, patch: patchOf(20_000) },
      fileContent: 'y'.repeat(20_000),
      ...overrides,
    })

  const patchPart = (p: string) => p.slice(p.indexOf('--- PATCH ---'))
  const contentPart = (p: string) => {
    const start = p.indexOf('--- CURRENT FILE CONTENT')
    return start === -1 ? '' : p.slice(start, p.indexOf('--- END FILE CONTENT ---'))
  }

  it('sends more of both parts to a model with a bigger window', () => {
    const small = buildChangeExplanationPrompt(big({ contextTokens: 4096 }))
    const large = buildChangeExplanationPrompt(big({ contextTokens: 32768 }))
    expect(large.length).toBeGreaterThan(small.length * 3)
  })

  it.each([4096, 8192, 24576])('stays inside a %i-token window', (window) => {
    // The worst of the six before this: two independent cuts whose *sum* was never checked, so a
    // large change in a large file overflowed on its own and dropped the instruction.
    const prompt = buildChangeExplanationPrompt(big({ contextTokens: window }))
    expect(
      estimateTokens(CHANGE_EXPLANATION_INSTRUCTION) + estimateTokens(prompt)
    ).toBeLessThanOrEqual(window)
  })

  it('serves the patch before the file content when both want more than there is', () => {
    // The patch is what is being explained; the content is supporting context. With none of the
    // patch there is no answer at all, only a description of a file.
    const prompt = buildChangeExplanationPrompt(big({ contextTokens: 8192 }))
    expect(patchPart(prompt).length).toBeGreaterThan(contentPart(prompt).length)
  })

  it('hands the surplus to the content when the patch is small', () => {
    // A short patch does not reserve room it cannot use — the common case of a one-line change in a
    // large file still gets as much of that file as the window allows.
    const tiny = buildChangeExplanationPrompt(
      big({ file: { ...input().file, patch: patchOf(50) }, contextTokens: 8192 })
    )
    const huge = buildChangeExplanationPrompt(big({ contextTokens: 8192 }))
    expect(contentPart(tiny).length).toBeGreaterThan(contentPart(huge).length)
  })

  it('sends both whole when everything fits', () => {
    const prompt = buildChangeExplanationPrompt(input({ contextTokens: 32768 }))
    expect(prompt).toContain('export function login() {}')
    expect(prompt).toContain('+new line')
    expect(prompt).not.toContain('truncated')
  })

  it('falls back to the no-content note when the window leaves no room for it', () => {
    // Same position for the model either way — no content — so it gets the same note rather than a
    // silently empty section it would invent around.
    const prompt = buildChangeExplanationPrompt(big({ contextTokens: 1200 }))
    expect(prompt).toContain("The file's content is not available")
  })
})

describe('assessChangeExplanationCoverage', () => {
  const patchOf = (size: number) =>
    `diff --git a/src/auth/login.ts b/src/auth/login.ts\n--- a/src/auth/login.ts\n+++ b/src/auth/login.ts\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

  it('reports a small change in a small file as fully read', () => {
    expect(assessChangeExplanationCoverage(input({ contextTokens: 24576 }))).toMatchObject({
      filesRead: 1,
      filesTotal: 1,
      complete: true,
    })
  })

  it('reports a patch the window had to shorten as unread', () => {
    const coverage = assessChangeExplanationCoverage(
      input({ file: { ...input().file, patch: patchOf(60_000) }, contextTokens: 4096 })
    )
    expect(coverage.complete).toBe(false)
    expect(coverage.filesRead).toBe(0)
  })

  it('charges the file content to the window it says is required', () => {
    // Reporting a window that fits the patch but not the content beside it would name a size that
    // still does not answer this feature's question.
    const file = { ...input().file, patch: patchOf(30_000) }
    const alone = assessChangeExplanationCoverage(
      input({ file, fileContent: undefined, contextTokens: 4096 })
    )
    const withContent = assessChangeExplanationCoverage(
      input({ file, fileContent: 'y'.repeat(60_000), contextTokens: 4096 })
    )
    expect(withContent.requiredContextTokens).toBeGreaterThan(alone.requiredContextTokens)
  })
})

describe('changeExplanationFeature — what it may say about coverage', () => {
  it('bans the coverage remark', () => {
    expect(changeExplanationFeature.instruction).toContain('NEVER mention truncation')
  })

  it('forbids concluding something is unused from a file it only saw the head of', () => {
    // Sharper here than elsewhere: when the content is trimmed the model holds a file's imports and
    // is asked about a change further down, having just been told it was given the file.
    expect(changeExplanationFeature.instruction).toContain(
      'unused, or never called merely because you cannot see it'
    )
    expect(changeExplanationFeature.instruction).toContain(
      'Absence of evidence is not evidence of absence'
    )
  })
})
