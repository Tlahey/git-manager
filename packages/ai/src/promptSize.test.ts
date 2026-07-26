import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTEXT_TOKENS, assessPromptSize, estimateTokens } from './promptSize'

/** A string estimating to roughly `tokens` tokens. */
function ofTokens(tokens: number): string {
  return 'x'.repeat(Math.round(tokens * 3.5))
}

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

describe('assessPromptSize', () => {
  it('counts both turns', () => {
    const { tokens } = assessPromptSize(ofTokens(100), ofTokens(200))
    expect(tokens).toBeGreaterThanOrEqual(299)
    expect(tokens).toBeLessThanOrEqual(301)
  })

  it('reads a small prompt as fine', () => {
    const { risk } = assessPromptSize(ofTokens(200), ofTokens(500))
    expect(risk).toBe('ok')
  })

  it('flags a prompt that leaves no room for the answer', () => {
    // Inside the window, but not once a 300-word review is written into it.
    const { risk } = assessPromptSize('', ofTokens(DEFAULT_CONTEXT_TOKENS - 200))
    expect(risk).toBe('tight')
  })

  it('flags a prompt past the assumed window', () => {
    const { risk, tokens } = assessPromptSize('', ofTokens(DEFAULT_CONTEXT_TOKENS + 1000))
    expect(risk).toBe('over')
    expect(tokens).toBeGreaterThan(DEFAULT_CONTEXT_TOKENS)
  })

  it('reports the window it judged against, rather than leaving it implicit', () => {
    // The caller has to be able to name the assumption — the app never reads a real context window.
    expect(assessPromptSize('a', 'b').contextTokens).toBe(DEFAULT_CONTEXT_TOKENS)
  })
})
