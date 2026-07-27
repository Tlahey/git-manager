import { describe, expect, it } from 'vitest'
import {
  buildSummarySearchPrompt,
  parseSummarySearch,
  type SummarySearchInput,
} from './summarySearch'

function input(overrides: Partial<SummarySearchInput> = {}): SummarySearchInput {
  return {
    question: 'When did we ship the merge editor?',
    candidates: [
      { repo: 'git-manager', date: '2026-07-21', text: 'Shipped the merge editor' },
      { repo: 'git-manager', date: '2026-07-20', text: 'Started the merge editor' },
    ],
    language: 'en',
    ...overrides,
  }
}

describe('buildSummarySearchPrompt', () => {
  it('carries the question, the language and every candidate day', () => {
    const prompt = buildSummarySearchPrompt(input())
    expect(prompt).toContain('When did we ship the merge editor?')
    expect(prompt).toContain('English')
    expect(prompt).toContain('## git-manager — 2026-07-21')
    expect(prompt).toContain('Shipped the merge editor')
    expect(prompt).toContain('## git-manager — 2026-07-20')
  })

  it('writes the answer language name for a non-English locale', () => {
    expect(buildSummarySearchPrompt(input({ language: 'fr' }))).toContain('French')
  })

  /** The list is ranked, so overflow drops the tail — never a mid-sentence cut of a kept day. */
  it('drops the least relevant days rather than truncating them when the budget is tight', () => {
    const long = 'x'.repeat(4000)
    const prompt = buildSummarySearchPrompt(
      input({
        candidates: [
          { repo: 'a', date: '2026-07-21', text: long },
          { repo: 'b', date: '2026-07-20', text: long },
          { repo: 'c', date: '2026-07-19', text: long },
        ],
        contextTokens: 2048,
      })
    )
    expect(prompt).toContain('## a — 2026-07-21')
    expect(prompt).not.toContain('## c — 2026-07-19')
  })

  it('always keeps the best match, even when it alone exceeds the budget', () => {
    const prompt = buildSummarySearchPrompt(
      input({
        candidates: [{ repo: 'a', date: '2026-07-21', text: 'y'.repeat(50000) }],
        contextTokens: 2048,
      })
    )
    expect(prompt).toContain('## a — 2026-07-21')
  })
})

describe('parseSummarySearch', () => {
  it('parses the schema shape', () => {
    expect(
      parseSummarySearch(
        '{"answer":"On the 21st.","matches":[{"repo":"git-manager","date":"2026-07-21","reason":"shipped it"}]}'
      )
    ).toEqual({
      answer: 'On the 21st.',
      matches: [{ repo: 'git-manager', date: '2026-07-21', reason: 'shipped it' }],
    })
  })

  it('tolerates prose / code fences around the object', () => {
    const raw = 'Sure!\n```json\n{"answer":" A ","matches":[]}\n```'
    expect(parseSummarySearch(raw)).toEqual({ answer: 'A', matches: [] })
  })

  /** A match missing an identifier can't be resolved back to a file, so it is worse than absent. */
  it('drops matches missing a repo or a date', () => {
    const parsed = parseSummarySearch(
      '{"answer":"A","matches":[{"repo":"","date":"2026-07-21","reason":"x"},{"repo":"r","date":"","reason":"y"},{"repo":"r","date":"2026-07-21","reason":"z"}]}'
    )
    expect(parsed.matches).toEqual([{ repo: 'r', date: '2026-07-21', reason: 'z' }])
  })

  it('accepts an answer with no matches — the "not in the archive" case', () => {
    expect(parseSummarySearch('{"answer":"Not covered here.","matches":[]}').matches).toEqual([])
  })

  it('throws when there is no JSON object', () => {
    expect(() => parseSummarySearch('no json here')).toThrow()
  })

  it('throws when the object is entirely empty', () => {
    expect(() => parseSummarySearch('{"answer":"","matches":[]}')).toThrow()
  })
})
