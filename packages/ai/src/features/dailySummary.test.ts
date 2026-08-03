import { describe, expect, it } from 'vitest'
import { buildDailySummaryPrompt, parseDailySummary, type DailySummaryInput } from './dailySummary'

function input(overrides: Partial<DailySummaryInput> = {}): DailySummaryInput {
  return {
    repoName: 'demo',
    branch: 'origin/main',
    date: '2026-07-27',
    commits: [],
    summaries: [],
    language: 'en',
    truncated: false,
    ...overrides,
  }
}

describe('buildDailySummaryPrompt', () => {
  it('lists the day’s commits with their stats and body', () => {
    const prompt = buildDailySummaryPrompt(
      input({
        commits: [
          {
            shortOid: 'abc1234',
            subject: 'feat: add summary',
            body: 'Long body\nsecond line',
            author: 'Ada',
            timestamp: 1,
            filesChanged: 3,
            insertions: 40,
            deletions: 5,
          },
        ],
      })
    )
    expect(prompt).toContain('feat: add summary (3 files, +40/-5)')
    expect(prompt).toContain('Long body')
  })

  it('renders the per-file summaries as the evidence, with a count', () => {
    const prompt = buildDailySummaryPrompt(
      input({
        summaries: [
          { path: 'src/a.ts', status: 'modified', intent: 'add a lookup', area: 'daily summary' },
          { path: 'src/b.ts', status: 'added', intent: 'render the panel', area: 'daily summary' },
        ],
      })
    )
    expect(prompt).toContain('All 2 files changed that day')
    expect(prompt).toContain('src/a.ts')
    expect(prompt).toContain('add a lookup')
  })

  it('names the branch and the day being summarized', () => {
    const prompt = buildDailySummaryPrompt(input())
    expect(prompt).toContain('branch: origin/main')
    expect(prompt).toContain('2026-07-27')
  })

  it('writes the language name', () => {
    expect(buildDailySummaryPrompt(input({ language: 'fr' }))).toContain('French')
  })

  it('adds a note when the commit list was truncated', () => {
    expect(buildDailySummaryPrompt(input({ truncated: true }))).toContain(
      'only the most recent commits are shown'
    )
  })

  /**
   * The working tree describes *now*. Feeding it into a record of a past day is what used to put
   * today's in-flight work into yesterday's briefing.
   */
  it('never mentions the working tree', () => {
    const prompt = buildDailySummaryPrompt(input())
    expect(prompt).not.toMatch(/uncommitted/i)
    expect(prompt).not.toMatch(/in-flight/i)
    expect(prompt).not.toMatch(/working tree/i)
  })
})

describe('parseDailySummary', () => {
  it('parses the schema shape', () => {
    expect(parseDailySummary('{"headline":"Shipped X","highlights":["did a","did b"]}')).toEqual({
      headline: 'Shipped X',
      highlights: ['did a', 'did b'],
    })
  })

  it('tolerates prose / code fences around the object and trims bullets', () => {
    const raw = 'Sure!\n```json\n{"headline":" H ","highlights":[" a ",""]}\n```'
    expect(parseDailySummary(raw)).toEqual({ headline: 'H', highlights: ['a'] })
  })

  it('drops non-string bullets', () => {
    expect(parseDailySummary('{"headline":"H","highlights":[1,"a",null]}')).toEqual({
      headline: 'H',
      highlights: ['a'],
    })
  })

  /** A model answering from a cached instruction can still use the old key; losing the day's
   * content over a key name would be a poor trade. */
  it('accepts the former `yesterday` key as the highlights', () => {
    expect(parseDailySummary('{"headline":"H","yesterday":["did a"]}')).toEqual({
      headline: 'H',
      highlights: ['did a'],
    })
  })

  it('throws when there is no JSON object', () => {
    expect(() => parseDailySummary('no json here')).toThrow()
  })

  it('throws when the object is entirely empty', () => {
    expect(() => parseDailySummary('{"headline":"","highlights":[]}')).toThrow()
  })
})
