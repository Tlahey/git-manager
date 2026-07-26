import { describe, expect, it } from 'vitest'
import {
  assessDiffCoverage,
  cappedList,
  diffCharBudget,
  notIncludedSection,
  type DiffPromptSizing,
} from './diffCoverage'
import { estimateTokens } from '../promptSize'

const INSTRUCTION = 'Explain the following diff. '.repeat(40)

function sizing(overrides: Partial<DiffPromptSizing> = {}): DiffPromptSizing {
  return { instruction: INSTRUCTION, envelopeTokens: 250, ...overrides }
}

const bulky = (path: string, size: number) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+${'x'.repeat(size)}\n`

describe('diffCharBudget', () => {
  it('grows with the model window', () => {
    expect(diffCharBudget(sizing({ contextTokens: 24576 }))).toBeGreaterThan(
      diffCharBudget(sizing({ contextTokens: 4096 }))
    )
  })

  it('shrinks when the instruction grows, so editing one cannot silently overflow the window', () => {
    const short = diffCharBudget(sizing({ instruction: 'Explain this.', contextTokens: 8192 }))
    const long = diffCharBudget(sizing({ contextTokens: 8192 }))
    expect(long).toBeLessThan(short)
  })

  it('leaves room for the instruction and the answer, never the whole window', () => {
    expect(diffCharBudget(sizing({ contextTokens: 4096 }))).toBeLessThan(4096 * 3.5)
  })

  it('returns zero rather than a negative budget for an absurdly small window', () => {
    expect(diffCharBudget(sizing({ contextTokens: 500 }))).toBe(0)
  })

  it('falls back to the pessimistic window when the connection declares none', () => {
    expect(diffCharBudget(sizing())).toBe(diffCharBudget(sizing({ contextTokens: 4096 })))
  })
})

describe('cappedList', () => {
  it('renders every path when they fit', () => {
    expect(cappedList(['a.ts', 'b.ts'], 5)).toBe('- a.ts\n- b.ts')
  })

  it('names the count it did not print rather than dropping it silently', () => {
    expect(cappedList(['a', 'b', 'c', 'd'], 2)).toBe('- a\n- b\n- …and 2 more')
  })

  it('renders nothing for an empty list', () => {
    expect(cappedList([], 5)).toBe('')
  })
})

describe('notIncludedSection', () => {
  it('is empty when everything got in, so no prompt mentions a truncation that did not happen', () => {
    expect(notIncludedSection([], 'review')).toBe('')
  })

  it('names the files and what the model must not do with them', () => {
    const section = notIncludedSection(['src/a.ts'], 'describe')
    expect(section).toContain('NOT INCLUDED below (budget exhausted)')
    expect(section).toContain('do not describe them')
    expect(section).toContain('- src/a.ts')
  })

  it('caps the list, which would otherwise grow as the budget shrinks', () => {
    const section = notIncludedSection(
      Array.from({ length: 40 }, (_, i) => `src/f${i}.ts`),
      'review'
    )
    expect(section.split('\n').filter((l) => l.startsWith('- ')).length).toBeLessThanOrEqual(13)
    expect(section).toContain('…and 28 more')
  })
})

describe('assessDiffCoverage', () => {
  it('reports a small change as fully read', () => {
    const diff = bulky('src/a.ts', 200) + bulky('src/b.ts', 200)
    expect(assessDiffCoverage(diff, sizing({ contextTokens: 24576 }))).toMatchObject({
      filesRead: 2,
      filesTotal: 2,
      complete: true,
      windowTooSmall: false,
    })
  })

  it('counts what a tight window had to leave out', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const coverage = assessDiffCoverage(diff, sizing({ contextTokens: 4096 }))
    expect(coverage.filesTotal).toBe(10)
    expect(coverage.filesRead).toBeLessThan(10)
    expect(coverage.complete).toBe(false)
  })

  it('does not count a half-read file as read', () => {
    // The self-contradiction this guards: "10 of 10 files read — reading all of it needs a bigger
    // window". A file the model saw half of is one it can draw a wrong conclusion from.
    const diff = bulky('src/a.ts', 200) + bulky('src/big.ts', 40_000)
    const coverage = assessDiffCoverage(diff, sizing({ contextTokens: 8192 }))
    expect(coverage.filesRead).toBeLessThan(coverage.filesTotal)
  })

  it('names a window that would actually carry the whole diff', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessDiffCoverage(diff, sizing({ contextTokens: 4096 }))
    // The advice has to be true: re-running at the suggested window must read everything.
    expect(
      assessDiffCoverage(diff, sizing({ contextTokens: requiredContextTokens })).complete
    ).toBe(true)
  })

  it('rounds up to a window someone would actually configure', () => {
    const diff = Array.from({ length: 10 }, (_, i) => bulky(`src/f${i}.ts`, 5000)).join('')
    const { requiredContextTokens } = assessDiffCoverage(diff, sizing({ contextTokens: 4096 }))
    expect([4096, 8192, 16384, 32768, 65536, 131072, 262144]).toContain(requiredContextTokens)
  })

  it('flags a window with no room for a diff at all — the one state trimming cannot fix', () => {
    const coverage = assessDiffCoverage(bulky('src/a.ts', 200), sizing({ contextTokens: 700 }))
    expect(coverage.windowTooSmall).toBe(true)
  })

  it('counts the instruction against the window, not just the diff', () => {
    const diff = Array.from({ length: 6 }, (_, i) => bulky(`src/f${i}.ts`, 2000)).join('')
    const withHugeInstruction = assessDiffCoverage(
      diff,
      sizing({ instruction: INSTRUCTION.repeat(10), contextTokens: 8192 })
    )
    const withSmallOne = assessDiffCoverage(diff, sizing({ contextTokens: 8192 }))
    expect(withHugeInstruction.filesRead).toBeLessThan(withSmallOne.filesRead)
    expect(withHugeInstruction.requiredContextTokens).toBeGreaterThan(
      withSmallOne.requiredContextTokens
    )
    expect(estimateTokens(INSTRUCTION.repeat(10))).toBeGreaterThan(estimateTokens(INSTRUCTION))
  })
})
