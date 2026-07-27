import { describe, it, expect } from 'vitest'
import { searchDailySummaries, tokenize } from './searchDailySummaries'
import type { StoredDailySummary } from '../stores/dailySummary.store'

function entry(overrides: Partial<StoredDailySummary> = {}): StoredDailySummary {
  return {
    repoPath: '/p/git-manager',
    repoName: 'git-manager',
    date: '2026-07-27',
    branch: 'origin/main',
    generatedAt: 0,
    commitCount: 1,
    fileCount: 1,
    filePath: '/archive/2026-07-27.md',
    summary: { headline: 'Shipped the merge editor', highlights: [] },
    ...overrides,
  }
}

describe('tokenize', () => {
  it('lower-cases and splits on punctuation', () => {
    expect(tokenize('Merge Editor, shipped!')).toEqual(['merge', 'editor', 'shipped'])
  })

  it('keeps hyphens, underscores and accented letters', () => {
    expect(tokenize('git-manager résumé_1')).toEqual(['git-manager', 'résumé_1'])
  })

  it('returns nothing for a blank query', () => {
    expect(tokenize('   ')).toEqual([])
  })
})

describe('searchDailySummaries', () => {
  it('returns everything, unranked, for an empty query', () => {
    const entries = [entry(), entry({ date: '2026-07-26', filePath: '/b.md' })]
    const results = searchDailySummaries(entries, '')
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.score === 0)).toBe(true)
  })

  it('matches the headline and reports it as a snippet', () => {
    const results = searchDailySummaries([entry()], 'merge editor')
    expect(results).toHaveLength(1)
    expect(results[0].snippets).toEqual(['Shipped the merge editor'])
  })

  it('matches a bullet and reports only the matching lines', () => {
    const results = searchDailySummaries(
      [
        entry({
          summary: {
            headline: 'A quiet day',
            highlights: ['Fixed the rebase conflict view', 'Bumped a dependency'],
          },
        }),
      ],
      'rebase'
    )
    expect(results[0].snippets).toEqual(['Fixed the rebase conflict view'])
  })

  /** An OR search over a personal archive returns the archive, which is not a search. */
  it('requires every term to match somewhere', () => {
    expect(searchDailySummaries([entry()], 'merge nonexistent')).toEqual([])
  })

  it('ranks a headline hit above a bullet-only hit', () => {
    const headlineHit = entry({ filePath: '/head.md' })
    const bulletHit = entry({
      filePath: '/bullet.md',
      date: '2026-07-26',
      summary: { headline: 'Other things', highlights: ['tweaked the merge editor'] },
    })
    const results = searchDailySummaries([bulletHit, headlineHit], 'merge')
    expect(results[0].entry.filePath).toBe('/head.md')
  })

  it('matches the repository name and the date', () => {
    expect(searchDailySummaries([entry()], 'git-manager')).toHaveLength(1)
    expect(searchDailySummaries([entry()], '2026-07')).toHaveLength(1)
    expect(searchDailySummaries([entry()], '2026-07-27')).toHaveLength(1)
  })

  /** "test" matching inside "latest" is a hit the user did not ask for; it should rank lower. */
  it('scores a whole-word match above a substring match', () => {
    const whole = entry({
      filePath: '/whole.md',
      summary: { headline: 'Added a test', highlights: [] },
    })
    const substring = entry({
      filePath: '/sub.md',
      date: '2026-07-26',
      summary: { headline: 'Used the latest build', highlights: [] },
    })
    const results = searchDailySummaries([substring, whole], 'test')
    expect(results[0].entry.filePath).toBe('/whole.md')
  })

  it('breaks score ties with the newer day first', () => {
    const older = entry({ date: '2026-07-20', filePath: '/old.md' })
    const newer = entry({ date: '2026-07-27', filePath: '/new.md' })
    const results = searchDailySummaries([older, newer], 'merge editor')
    expect(results[0].entry.filePath).toBe('/new.md')
  })

  it('is case-insensitive', () => {
    expect(searchDailySummaries([entry()], 'MERGE')).toHaveLength(1)
  })

  /** A term with regex metacharacters must be searched literally, not compiled. */
  it('does not choke on regex metacharacters in the query', () => {
    expect(() => searchDailySummaries([entry()], 'a+b(c')).not.toThrow()
  })
})
