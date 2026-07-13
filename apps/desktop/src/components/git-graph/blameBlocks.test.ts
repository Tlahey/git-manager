import { describe, it, expect } from 'vitest'
import type { BlameHunk } from '@git-manager/git-types'
import {
  blameBlocks,
  blameColorIndex,
  truncateCommitName,
  BLAME_COLOR_COUNT,
} from './blameBlocks'

function hunk(overrides: Partial<BlameHunk> & Pick<BlameHunk, 'startLine' | 'lineCount' | 'commitOid'>): BlameHunk {
  return {
    shortOid: overrides.commitOid.slice(0, 7),
    authorName: 'A',
    authorEmail: 'a@x',
    timestamp: 0,
    summary: 's',
    body: '',
    ...overrides,
  }
}

describe('blameBlocks', () => {
  it('turns each distinct-commit hunk into its own block with an inclusive line range', () => {
    const blocks = blameBlocks([
      hunk({ startLine: 1, lineCount: 2, commitOid: 'aaa' }),
      hunk({ startLine: 3, lineCount: 1, commitOid: 'bbb' }),
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ commitOid: 'aaa', startLine: 1, endLine: 2 })
    expect(blocks[1]).toMatchObject({ commitOid: 'bbb', startLine: 3, endLine: 3 })
  })

  it('coalesces adjacent hunks from the same commit into one block', () => {
    const blocks = blameBlocks([
      hunk({ startLine: 1, lineCount: 2, commitOid: 'aaa' }),
      hunk({ startLine: 3, lineCount: 2, commitOid: 'aaa' }),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ startLine: 1, endLine: 4 })
  })

  it('does not merge same-commit hunks separated by a gap', () => {
    const blocks = blameBlocks([
      hunk({ startLine: 1, lineCount: 1, commitOid: 'aaa' }),
      hunk({ startLine: 5, lineCount: 1, commitOid: 'aaa' }),
    ])
    expect(blocks).toHaveLength(2)
  })

  it('sorts out-of-order hunks and skips empty ones', () => {
    const blocks = blameBlocks([
      hunk({ startLine: 3, lineCount: 1, commitOid: 'bbb' }),
      hunk({ startLine: 1, lineCount: 0, commitOid: 'ccc' }),
      hunk({ startLine: 1, lineCount: 2, commitOid: 'aaa' }),
    ])
    expect(blocks.map((b) => b.startLine)).toEqual([1, 3])
  })
})

describe('truncateCommitName', () => {
  it('keeps a summary of exactly 31 chars untouched', () => {
    const s = 'x'.repeat(31)
    expect(truncateCommitName(s)).toBe(s)
    expect(truncateCommitName(s)).toHaveLength(31)
  })

  it('cuts a longer summary to 28 chars plus an ellipsis (31 total)', () => {
    const s = 'test(desktop): add exhaustive coverage'
    const out = truncateCommitName(s)
    expect(out).toBe('test(desktop): add exhaustiv...')
    expect(out).toHaveLength(31)
  })

  it('leaves short summaries as-is', () => {
    expect(truncateCommitName('fix bug')).toBe('fix bug')
  })
})

describe('blameColorIndex', () => {
  it('is deterministic and within range', () => {
    const i = blameColorIndex('deadbeef')
    expect(i).toBe(blameColorIndex('deadbeef'))
    expect(i).toBeGreaterThanOrEqual(0)
    expect(i).toBeLessThan(BLAME_COLOR_COUNT)
  })
})
