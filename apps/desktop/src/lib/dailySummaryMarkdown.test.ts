import { describe, it, expect } from 'vitest'
import {
  renderDailySummaryMarkdown,
  parseDailySummaryMarkdown,
  summaryPlainText,
  type DailySummaryEntry,
} from './dailySummaryMarkdown'

function entry(overrides: Partial<DailySummaryEntry> = {}): DailySummaryEntry {
  return {
    repoPath: '/Users/x/git-manager',
    repoName: 'git-manager',
    date: '2026-07-27',
    branch: 'origin/main',
    generatedAt: Date.parse('2026-07-27T08:12:03.000Z'),
    commitCount: 7,
    fileCount: 12,
    summary: {
      headline: 'Shipped the summaries archive',
      highlights: ['Added the markdown archive', 'Scoped the window to main'],
    },
    ...overrides,
  }
}

describe('renderDailySummaryMarkdown', () => {
  it('writes flat front matter and both sections', () => {
    const markdown = renderDailySummaryMarkdown(entry())
    expect(markdown.startsWith('---\n')).toBe(true)
    expect(markdown).toContain('repo: git-manager')
    expect(markdown).toContain('repoPath: /Users/x/git-manager')
    expect(markdown).toContain('date: 2026-07-27')
    expect(markdown).toContain('branch: origin/main')
    expect(markdown).toContain('commits: 7')
    expect(markdown).toContain('files: 12')
    expect(markdown).toContain('# 2026-07-27 — git-manager')
    expect(markdown).toContain('## Highlights')
    expect(markdown).toContain('- Added the markdown archive')
  })

  /** One front-matter entry has to stay one line, or the block stops parsing at the stray newline. */
  it('collapses newlines inside a front-matter value', () => {
    const markdown = renderDailySummaryMarkdown(entry({ repoName: 'multi\nline' }))
    expect(markdown).toContain('repo: multi line')
  })

  it('marks an empty section rather than leaving it blank', () => {
    const markdown = renderDailySummaryMarkdown(
      entry({ summary: { headline: 'H', highlights: [] } })
    )
    expect(markdown).toContain('_(nothing)_')
  })
})

describe('parseDailySummaryMarkdown', () => {
  it('round-trips a rendered briefing', () => {
    const original = entry()
    const parsed = parseDailySummaryMarkdown(renderDailySummaryMarkdown(original))
    expect(parsed).toEqual(original)
  })

  it('round-trips a briefing with empty sections', () => {
    const original = entry({ summary: { headline: 'Quiet day', highlights: [] } })
    const parsed = parseDailySummaryMarkdown(renderDailySummaryMarkdown(original))
    expect(parsed?.summary).toEqual({ headline: 'Quiet day', highlights: [] })
  })

  /** The file is the source of truth, so a user editing it by hand must not break the archive. */
  it('falls back to the caller-supplied metadata when the front matter is gone', () => {
    const parsed = parseDailySummaryMarkdown(
      '# Notes\n\nDid things\n\n## Highlights\n- keep going\n',
      { date: '2026-07-20', repoPath: '/p', repoName: 'p' }
    )
    expect(parsed?.date).toBe('2026-07-20')
    expect(parsed?.repoName).toBe('p')
    expect(parsed?.summary.headline).toBe('Did things')
    expect(parsed?.summary.highlights).toEqual(['keep going'])
    expect(parsed?.generatedAt).toBe(0)
  })

  /**
   * Files written while a briefing still described "yesterday and today" stay in the archive for
   * another two months; reading no bullets out of them would look like data loss.
   */
  it('reads the former `## Yesterday` heading of an older archived file', () => {
    const parsed = parseDailySummaryMarkdown(
      '---\ndate: 2026-07-27\nrepo: r\n---\n\n# t\n\nHead\n\n## Yesterday\n- a\n\n## Today\n- b\n'
    )
    expect(parsed?.summary.highlights).toEqual(['a'])
  })

  it('accepts `*` bullets and reordered front matter', () => {
    const parsed = parseDailySummaryMarkdown(
      '---\ndate: 2026-07-27\nrepo: r\n---\n\n# t\n\nHead\n\n## Highlights\n* one\n* two\n'
    )
    expect(parsed?.repoName).toBe('r')
    expect(parsed?.summary.highlights).toEqual(['one', 'two'])
  })

  it('tolerates CRLF line endings', () => {
    const parsed = parseDailySummaryMarkdown(
      '---\r\ndate: 2026-07-27\r\nrepo: r\r\n---\r\n\r\n# t\r\n\r\nHead\r\n\r\n## Highlights\r\n- one\r\n'
    )
    expect(parsed?.summary.highlights).toEqual(['one'])
  })

  it('stops a section at the next heading', () => {
    const parsed = parseDailySummaryMarkdown(
      '---\ndate: 2026-07-27\n---\n\n# t\n\nHead\n\n## Highlights\n- a\n\n## Notes\n- b\n'
    )
    expect(parsed?.summary.highlights).toEqual(['a'])
  })

  it('returns null when there is no date to file the briefing under', () => {
    expect(parseDailySummaryMarkdown('# just a note\n')).toBeNull()
  })

  it('ignores a malformed generatedAt / counts rather than producing NaN', () => {
    const parsed = parseDailySummaryMarkdown(
      '---\ndate: 2026-07-27\ngeneratedAt: nope\ncommits: many\n---\n\n# t\n\nHead\n'
    )
    expect(parsed?.generatedAt).toBe(0)
    expect(parsed?.commitCount).toBe(0)
  })
})

describe('summaryPlainText', () => {
  it('flattens the headline and the highlights, dropping blanks', () => {
    expect(summaryPlainText({ headline: 'H', highlights: ['a', '  ', 'b'] })).toBe('H\na\nb')
  })
})
