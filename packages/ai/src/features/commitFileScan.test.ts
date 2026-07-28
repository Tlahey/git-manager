import { describe, it, expect } from 'vitest'
import {
  buildCommitFileScanPrompt,
  parseCommitFileScan,
  COMMIT_FILE_SCAN_INSTRUCTION,
  commitFileScanFeature,
  type CommitFileScanInput,
} from './commitFileScan'

function input(overrides: Partial<CommitFileScanInput> = {}): CommitFileScanInput {
  return {
    question: 'Did the Button change?',
    commit: {
      shortOid: 'aaaaaaa',
      subject: 'feat(ui): loading state on Button',
      body: 'Adds a spinner inside the button while a request is pending.',
    },
    files: [
      { path: 'packages/ui/src/Button.tsx', status: 'modified' },
      { path: 'pnpm-lock.yaml', status: 'modified' },
    ],
    ...overrides,
  }
}

describe('buildCommitFileScanPrompt', () => {
  it('carries the question, the commit’s message and every path — and no diff', () => {
    const prompt = buildCommitFileScanPrompt(input())

    expect(prompt).toContain('Did the Button change?')
    expect(prompt).toContain('feat(ui): loading state on Button')
    expect(prompt).toContain('Adds a spinner inside the button')
    expect(prompt).toContain('packages/ui/src/Button.tsx')
    expect(prompt).toContain('pnpm-lock.yaml')
    expect(prompt).not.toContain('@@')
  })

  /**
   * A path is barely legible on its own: `index.ts` means nothing until you know the commit was
   * about the graph. The message is what makes the list judgeable.
   */
  it('states how many paths it carried, so a cut list is visible', () => {
    expect(buildCommitFileScanPrompt(input())).toContain('Files touched (2 of 2)')
  })

  it('cuts the list rather than the prompt when it cannot fit', () => {
    const files = Array.from({ length: 400 }, (_, i) => ({
      path: `packages/app/src/some/deep/directory/module-${i}/index.tsx`,
      status: 'modified',
    }))
    const prompt = buildCommitFileScanPrompt(input({ files, contextTokens: 4096 }))

    expect(prompt).toContain('module-0/')
    expect(prompt).not.toContain('module-399/')
    expect(prompt).not.toContain('Files touched (400 of 400)')
  })
})

describe('the instruction', () => {
  /** Same asymmetry as the commit shortlist: a wrong inclusion costs one read, a wrong exclusion is final. */
  it('leans towards opening a doubtful file', () => {
    expect(COMMIT_FILE_SCAN_INSTRUCTION).toMatch(/When in doubt, include it/)
    expect(COMMIT_FILE_SCAN_INSTRUCTION).toMatch(/gone from the answer for good/)
  })

  /** Returning everything would make the narrowing pointless — which is the whole reason it exists. */
  it('refuses both extremes', () => {
    expect(COMMIT_FILE_SCAN_INSTRUCTION).toMatch(/Do NOT return every path/)
    expect(COMMIT_FILE_SCAN_INSTRUCTION).toMatch(/lock files, snapshots, generated output/)
  })

  it('forbids reasoning about code it has not seen', () => {
    expect(COMMIT_FILE_SCAN_INSTRUCTION).toMatch(/never on what you imagine the code does/)
    expect(COMMIT_FILE_SCAN_INSTRUCTION).toMatch(/Never invent a path/)
  })
})

describe('parseCommitFileScan', () => {
  it('reads the paths', () => {
    expect(parseCommitFileScan('{"paths":["a.ts","b.ts"]}')).toEqual(['a.ts', 'b.ts'])
  })

  it('reads an object wrapped in prose or fences', () => {
    expect(parseCommitFileScan('Sure:\n```json\n{"paths":["a.ts"]}\n```')).toEqual(['a.ts'])
  })

  it('treats an empty array as the answer it is', () => {
    expect(parseCommitFileScan('{"paths":[]}')).toEqual([])
  })

  it('drops blanks and non-strings rather than passing them on', () => {
    expect(parseCommitFileScan('{"paths":["a.ts","  ",null,42,"b.ts"]}')).toEqual(['a.ts', 'b.ts'])
  })

  /** The caller reads that as "narrow nothing" and opens every file — the safe direction. */
  it('returns nothing rather than throwing on an unreadable answer', () => {
    expect(parseCommitFileScan('I think all of them matter.')).toEqual([])
    expect(parseCommitFileScan('{"paths": not json}')).toEqual([])
    expect(parseCommitFileScan('')).toEqual([])
  })
})

describe('commitFileScanFeature', () => {
  it('is a schema-constrained completion, kept reproducible', () => {
    expect(commitFileScanFeature.kind).toBe('completion')
    expect(commitFileScanFeature.schema).toBeDefined()
    expect(commitFileScanFeature.temperature).toBeLessThanOrEqual(0.2)
  })

  /** A file it drops is never opened, so this is not a call to hand to a weaker model. */
  it('runs on the main model', () => {
    expect(commitFileScanFeature.tier).toBeUndefined()
  })
})
