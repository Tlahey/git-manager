import { describe, expect, it } from 'vitest'
import type { AiActivity } from '../config'
import { buildDailySummaryPrompt, parseDailySummary } from './dailySummary'

function activity(overrides: Partial<AiActivity> = {}): AiActivity {
  return {
    repoName: 'demo',
    branch: 'main',
    commits: [],
    pending: [],
    truncated: false,
    ...overrides,
  }
}

describe('buildDailySummaryPrompt', () => {
  it('lists commits with their stats and body, and the pending changes', () => {
    const prompt = buildDailySummaryPrompt(
      activity({
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
        pending: [{ path: 'src/a.ts', status: 'modified' }],
      })
    )
    expect(prompt).toContain('feat: add summary (3 files, +40/-5)')
    expect(prompt).toContain('Long body')
    expect(prompt).toContain('- src/a.ts (modified)')
  })

  it('writes the language name and marks empty windows / clean trees', () => {
    const prompt = buildDailySummaryPrompt(activity({ language: 'fr' }))
    expect(prompt).toContain('French')
    expect(prompt).toContain('(no commits in this window)')
    expect(prompt).toContain('(working tree is clean)')
  })

  it('adds a note when the commit list was truncated', () => {
    const prompt = buildDailySummaryPrompt(activity({ truncated: true }))
    expect(prompt).toContain('only the most recent commits are shown')
  })
})

describe('parseDailySummary', () => {
  it('parses the schema shape', () => {
    expect(
      parseDailySummary(
        '{"headline":"Shipped X","yesterday":["did a","did b"],"today":["do c"]}'
      )
    ).toEqual({ headline: 'Shipped X', yesterday: ['did a', 'did b'], today: ['do c'] })
  })

  it('tolerates prose / code fences around the object and trims bullets', () => {
    const raw = 'Sure!\n```json\n{"headline":" H ","yesterday":[" a ",""],"today":[]}\n```'
    expect(parseDailySummary(raw)).toEqual({ headline: 'H', yesterday: ['a'], today: [] })
  })

  it('drops non-string bullets', () => {
    expect(
      parseDailySummary('{"headline":"H","yesterday":[1,"a",null],"today":["b"]}')
    ).toEqual({ headline: 'H', yesterday: ['a'], today: ['b'] })
  })

  it('throws when there is no JSON object', () => {
    expect(() => parseDailySummary('no json here')).toThrow()
  })

  it('throws when the object is entirely empty', () => {
    expect(() => parseDailySummary('{"headline":"","yesterday":[],"today":[]}')).toThrow()
  })
})
