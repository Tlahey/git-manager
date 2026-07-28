import { describe, it, expect } from 'vitest'
import {
  buildCommitQuickScanPrompt,
  parseCommitQuickScan,
  COMMIT_QUICK_SCAN_INSTRUCTION,
  commitQuickScanFeature,
  type CommitQuickScanInput,
  type QuickScanCommit,
} from './commitQuickScan'

function commit(overrides: Partial<QuickScanCommit> = {}): QuickScanCommit {
  return {
    shortOid: 'aaaaaaa',
    subject: 'feat(ui): loading state on Button',
    body: '',
    author: 'Ada',
    date: '2026-07-14',
    ...overrides,
  }
}

function input(overrides: Partial<CommitQuickScanInput> = {}): CommitQuickScanInput {
  return {
    question: 'Did the Button change?',
    repoName: 'demo',
    branch: 'main',
    commits: [commit()],
    ...overrides,
  }
}

describe('buildCommitQuickScanPrompt', () => {
  it('carries every commit’s message, and nothing about the code', () => {
    const prompt = buildCommitQuickScanPrompt(
      input({
        commits: [
          commit({ shortOid: 'c1', subject: 'feat: a' }),
          commit({ shortOid: 'c2', subject: 'fix: b', body: 'the details' }),
        ],
      })
    )

    expect(prompt).toContain('c1')
    expect(prompt).toContain('feat: a')
    expect(prompt).toContain('the details')
    expect(prompt).not.toContain('diff')
    expect(prompt).toContain('Did the Button change?')
  })

  it('says how many of the commits it managed to carry', () => {
    const prompt = buildCommitQuickScanPrompt(
      input({ commits: [commit({ shortOid: 'c1' }), commit({ shortOid: 'c2' })] })
    )
    expect(prompt).toContain('Commits (2 of 2, newest first)')
  })

  /**
   * "Did this change *recently*?" is answered by the recent end, so that is the end that survives a
   * window too small to hold the list — and the prompt says how many it dropped.
   */
  it('cuts the oldest commits when the list outgrows the window, not the newest', () => {
    const commits = Array.from({ length: 400 }, (_, i) =>
      commit({ shortOid: `c${i}`, subject: `feat: change number ${i} in a long subject line` })
    )
    const prompt = buildCommitQuickScanPrompt(input({ commits, contextTokens: 4096 }))

    expect(prompt).toContain('c0')
    expect(prompt).not.toContain('c399')
    expect(prompt).not.toContain('Commits (400 of 400')
  })
})

describe('the instruction', () => {
  /** The one thing this pass must never do is state what the code does — it has seen none. */
  it('frames the answer as a shortlist, not a verdict', () => {
    expect(COMMIT_QUICK_SCAN_INSTRUCTION).toMatch(/SHORTLIST/)
    expect(COMMIT_QUICK_SCAN_INSTRUCTION).toMatch(/Never state what the code does/)
  })

  /**
   * The opposite lean to the deep scan's, and deliberately so: here a wrong inclusion costs one
   * file-by-file read that rejects it, while a wrong exclusion loses the commit for good.
   */
  it('leans towards including a doubtful commit, unlike the deep scan', () => {
    expect(COMMIT_QUICK_SCAN_INSTRUCTION).toMatch(/When in doubt, include it/)
    expect(COMMIT_QUICK_SCAN_INSTRUCTION).toMatch(/gone from the answer for good/)
    // Not a licence to return everything, which would make the shortlist pointless.
    expect(COMMIT_QUICK_SCAN_INSTRUCTION).toMatch(/not licence to include everything/)
  })
})

describe('parseCommitQuickScan', () => {
  it('reads the shortlist', () => {
    const parsed = parseCommitQuickScan(
      '{"matches":[{"shortOid":"abc1234","reason":"mentions the button"}]}'
    )
    expect(parsed).toEqual([{ shortOid: 'abc1234', reason: 'mentions the button' }])
  })

  it('reads an object wrapped in prose or fences', () => {
    const parsed = parseCommitQuickScan(
      'Here you go:\n```json\n{"matches":[{"shortOid":"abc1234","reason":"x"}]}\n```'
    )
    expect(parsed).toHaveLength(1)
  })

  it('treats an empty array as the answer it is', () => {
    expect(parseCommitQuickScan('{"matches":[]}')).toEqual([])
  })

  /** A commit picked without a reason is a guess, and it would cost a full file-by-file read. */
  it('drops an entry with no reason', () => {
    expect(parseCommitQuickScan('{"matches":[{"shortOid":"abc1234","reason":"  "}]}')).toEqual([])
  })

  it('drops an entry with no sha, since nothing could be opened from it', () => {
    expect(parseCommitQuickScan('{"matches":[{"shortOid":"","reason":"something"}]}')).toEqual([])
  })

  it('returns nothing rather than throwing on an unreadable answer', () => {
    expect(parseCommitQuickScan('I could not find anything relevant.')).toEqual([])
    expect(parseCommitQuickScan('{"matches": not json}')).toEqual([])
    expect(parseCommitQuickScan('')).toEqual([])
  })
})

describe('commitQuickScanFeature', () => {
  it('is a schema-constrained completion, kept reproducible', () => {
    expect(commitQuickScanFeature.kind).toBe('completion')
    expect(commitQuickScanFeature.schema).toBeDefined()
    expect(commitQuickScanFeature.temperature).toBeLessThanOrEqual(0.2)
  })

  /**
   * Not `fast`. Everything downstream depends on this shortlist being right — a commit it drops is
   * never looked at — so it is the last call in the app to run on a weaker model.
   */
  it('runs on the main model', () => {
    expect(commitQuickScanFeature.tier).toBeUndefined()
  })
})
