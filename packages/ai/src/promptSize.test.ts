import { describe, expect, it } from 'vitest'
import { contextTokensFor, estimateTokens, variableCharBudget } from './promptSize'

describe('estimateTokens', () => {
  it('scales with length and rounds up', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('x')).toBe(1)
    expect(estimateTokens('x'.repeat(3500))).toBe(1000)
  })

  it('estimates denser than the prose rule of thumb', () => {
    // Diffs tokenize worse than English, and under-warning is the failure mode that matters: it
    // stays quiet while the instruction is being cut off.
    expect(estimateTokens('x'.repeat(4000))).toBeGreaterThan(1000)
  })
})

describe('variableCharBudget', () => {
  it('grows with the window and shrinks with the overhead', () => {
    expect(variableCharBudget(32768, 1000)).toBeGreaterThan(variableCharBudget(8192, 1000))
    expect(variableCharBudget(8192, 4000)).toBeLessThan(variableCharBudget(8192, 1000))
  })

  it('never goes negative when the overhead already fills the window', () => {
    expect(variableCharBudget(1000, 5000)).toBe(0)
  })

  it('leaves room for the answer, not just the prompt', () => {
    // A window entirely spent on input would leave the model nothing to reply into.
    expect(variableCharBudget(4096, 0)).toBeLessThan(4096 * 3.5)
  })
})

describe('contextTokensFor', () => {
  it('inverts variableCharBudget: its answer really does carry the content', () => {
    for (const chars of [1000, 50_000, 250_000]) {
      const window = contextTokensFor(chars, 1200)
      expect(variableCharBudget(window, 1200)).toBeGreaterThanOrEqual(chars)
    }
  })

  it('asks for more window as the content grows', () => {
    expect(contextTokensFor(100_000, 1200)).toBeGreaterThan(contextTokensFor(10_000, 1200))
  })
})
