import { describe, it, expect } from 'vitest'
import { stripReasoning } from './reasoning'

describe('stripReasoning', () => {
  /**
   * The shape that actually leaked past the first version: the label and the deliberation on one
   * line, with no markdown prefix. It required a newline after the word, which this never has.
   */
  it('removes a narration label that runs straight into its own reasoning', () => {
    const raw = [
      'Thinking Process: 1. **Analyze the Request** — the user asks about the button.',
      '2. **Check the findings** — two commits mention it.',
      '',
      '**Yes**, the button changed twice.',
      '',
      '## What changed',
      '- `abc1234` — adds a loading state',
    ].join('\n')

    expect(stripReasoning(raw)).toBe(
      [
        '**Yes**, the button changed twice.',
        '',
        '## What changed',
        '- `abc1234` — adds a loading state',
      ].join('\n')
    )
  })

  it('removes the same label in French, and with markdown around it', () => {
    expect(stripReasoning('**Réflexion :** je regarde les commits…\n\n**Non.**')).toBe('**Non.**')
    expect(stripReasoning('Raisonnement: bla bla\n\n## Ce qui a changé\n- x')).toBe(
      '## Ce qui a changé\n- x'
    )
  })

  /**
   * The colon is what separates a label from a real answer's own words, now that the markdown
   * prefix is optional — without it, an answer opening on the word "Analysis" would be eaten.
   */
  it('leaves the same words alone when they are not a label', () => {
    const answer = 'Analysis tooling changed in two commits.\n\n## What changed\n- `abc1234` — x'
    expect(stripReasoning(answer)).toBe(answer)

    const midway = '**Yes.**\n\n## What changed\n- reasoning: the model was told to explain itself'
    expect(stripReasoning(midway)).toBe(midway)
  })

  it('leaves an ordinary answer untouched', () => {
    const answer = '**Yes**, twice.\n\n## What changed\n- `abc1234` — adds a loading state'
    expect(stripReasoning(answer)).toBe(answer)
  })

  it('drops a tagged block and keeps what follows', () => {
    const raw = '<think>The user asks about buttons. Let me check…</think>\n\n**No.**'
    expect(stripReasoning(raw)).toBe('**No.**')
  })

  it('handles the tag variants models actually emit', () => {
    for (const tag of ['think', 'thinking', 'reasoning', 'analysis']) {
      expect(stripReasoning(`<${tag}>hmm</${tag}>**Yes.**`)).toBe('**Yes.**')
    }
  })

  /**
   * The streaming case, and the reason this runs on every token rather than once at the end: until
   * the closing tag arrives, everything after the opener is deliberation, and showing it is the bug.
   */
  it('hides an unclosed block while it is still streaming', () => {
    expect(stripReasoning('<think>I should first look at the diff and')).toBe('')
  })

  it('drops a leading narration section up to the next heading', () => {
    const raw = '## Thinking Process\nThe question is about buttons.\n\n## What changed\n- a thing'
    expect(stripReasoning(raw)).toBe('## What changed\n- a thing')
  })

  it('stops at the answer even when the narration opens in bold', () => {
    const raw = '**Thinking Process**\nweighing the commits\n\n**No.**\n\n## In short\nnothing'
    expect(stripReasoning(raw)).toBe('**No.**\n\n## In short\nnothing')
  })

  it('reads the French headings too, since answers are written in the user’s language', () => {
    const raw = '### Réflexion\nJe regarde les commits.\n\n**Non.**'
    expect(stripReasoning(raw)).toBe('**Non.**')
  })

  it('yields nothing when narration is all there is yet', () => {
    expect(stripReasoning('## Thinking Process\nstill weighing the options')).toBe('')
  })

  /** The guard against eating a real answer: only a *leading* narration heading is dropped. */
  it('keeps a mid-answer section that merely mentions reasoning', () => {
    const raw = '**Yes.**\n\n## Reasoning about the change\n- it refactors the parser'
    expect(stripReasoning(raw)).toBe(raw)
  })

  it('leaves a heading that only starts with a similar word alone', () => {
    const raw = '## Analysis tooling\n- adds a linter'
    expect(stripReasoning(raw)).toBe(raw)
  })
})
