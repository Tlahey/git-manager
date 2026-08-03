import { describe, expect, it } from 'vitest'
import { detectScope, formatCommitMessage, parseCommitMessage, truncateDiff } from './commitMessage'

describe('detectScope', () => {
  it('returns the shared top-level directory when all files share one', () => {
    expect(
      detectScope([
        { path: 'src/a.ts', status: 'modified' },
        { path: 'src/b.ts', status: 'added' },
      ])
    ).toBe('src')
  })

  it('returns undefined when files span multiple top-level directories', () => {
    expect(
      detectScope([
        { path: 'src/a.ts', status: 'modified' },
        { path: 'docs/b.md', status: 'added' },
      ])
    ).toBeUndefined()
  })

  it('returns undefined for no files', () => {
    expect(detectScope([])).toBeUndefined()
  })
})

describe('truncateDiff', () => {
  it('returns short diffs unchanged', () => {
    expect(truncateDiff('abc')).toBe('abc')
  })

  it('truncates and marks oversized diffs', () => {
    const out = truncateDiff('x'.repeat(50), 10)
    expect(out.startsWith('x'.repeat(10))).toBe(true)
    expect(out).toContain('[diff truncated, showing first 10 chars]')
  })
})

describe('parseCommitMessage', () => {
  it('reads the subject and body out of the structured answer', () => {
    expect(parseCommitMessage('{"subject":"feat: add x","body":"Because y."}')).toEqual({
      subject: 'feat: add x',
      body: 'Because y.',
    })
  })

  it('treats an empty body as no body', () => {
    expect(parseCommitMessage('{"subject":"fix: y","body":""}').body).toBe('')
  })

  it('digs the object out of a ```json fence a provider wrapped it in', () => {
    const raw = '```json\n{"subject":"docs: update readme","body":""}\n```'
    expect(parseCommitMessage(raw).subject).toBe('docs: update readme')
  })

  it('falls back to prose when the provider ignored response_format', () => {
    // This feature answered in prose for its whole streaming life; a provider that does not honour
    // the schema still returns a perfectly usable message.
    expect(parseCommitMessage('chore: bump deps')).toEqual({
      subject: 'chore: bump deps',
      body: '',
    })
  })

  it('splits a prose answer into subject and body at the first line', () => {
    expect(parseCommitMessage('feat: add x\n\nBecause y.')).toEqual({
      subject: 'feat: add x',
      body: 'Because y.',
    })
  })

  it('rejects an empty answer rather than committing nothing', () => {
    expect(() => parseCommitMessage('   ')).toThrow()
  })
})

describe('formatCommitMessage', () => {
  it('separates a body from the subject with a blank line', () => {
    expect(formatCommitMessage({ subject: 'feat: a', body: 'Why.' })).toBe('feat: a\n\nWhy.')
  })

  it('emits the subject alone when there is no body', () => {
    expect(formatCommitMessage({ subject: 'feat: a', body: '' })).toBe('feat: a')
    expect(formatCommitMessage({ subject: 'feat: a', body: '   ' })).toBe('feat: a')
  })
})
