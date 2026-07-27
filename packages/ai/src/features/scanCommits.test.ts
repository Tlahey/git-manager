import { describe, it, expect, vi } from 'vitest'
import type { ScanCommit } from '../config'
import type { CommitRelevanceResult } from './commitRelevance'
import { scanCommits, type CommitScanProgress, type ScannedCommit } from './scanCommits'
import { SummaryRunCancelled } from './summarizeFiles'

function commit(overrides: Partial<ScanCommit> = {}): ScanCommit {
  return {
    oid: 'a'.repeat(40),
    shortOid: 'aaaaaaa',
    subject: 'feat: something',
    body: '',
    author: 'Ada',
    timestamp: 1_784_073_600,
    files: [{ path: 'packages/ui/src/Button.tsx', status: 'modified' }],
    filesTruncated: false,
    insertions: 3,
    deletions: 1,
    parentCount: 1,
    ...overrides,
  }
}

const positive: CommitRelevanceResult = {
  relevant: true,
  finding: 'adds a loading state',
  files: ['packages/ui/src/Button.tsx'],
}

const params = { question: 'Did the Button change?' }

describe('scanCommits', () => {
  it('reads every commit and pairs each verdict with the commit it came from', async () => {
    const commits = [commit({ shortOid: 'c1' }), commit({ shortOid: 'c2' })]
    const judge = vi.fn().mockResolvedValue(positive)

    const results = await scanCommits(commits, () => Promise.resolve('diff'), judge, params)

    expect(judge).toHaveBeenCalledTimes(2)
    expect(results.map((r) => r.commit.shortOid)).toEqual(['c1', 'c2'])
    expect(results.every((r) => r.relevant)).toBe(true)
  })

  it('passes the question, the commit and its diff to each call', async () => {
    const judge = vi.fn().mockResolvedValue(positive)
    await scanCommits([commit()], () => Promise.resolve('the patch'), judge, {
      question: 'Did the Button change?',
      language: 'fr',
      contextTokens: 8192,
    })

    expect(judge).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Did the Button change?',
        diff: 'the patch',
        language: 'fr',
        contextTokens: 8192,
        commit: expect.objectContaining({ shortOid: 'aaaaaaa' }),
      })
    )
  })

  it('drops a path the model named that the commit never touched', async () => {
    // The panel turns these into links; an invented one would open nothing.
    const judge = vi.fn().mockResolvedValue({
      relevant: true,
      finding: 'x',
      files: ['packages/ui/src/Button.tsx', 'src/imagined/File.tsx'],
    })
    const [result] = await scanCommits([commit()], () => Promise.resolve('d'), judge, params)
    expect(result.files).toEqual(['packages/ui/src/Button.tsx'])
  })

  it('keeps a commit whose call failed, flagged rather than silently negative', async () => {
    const judge = vi.fn().mockRejectedValue(new Error('provider down'))
    const [result] = await scanCommits([commit()], () => Promise.resolve('d'), judge, params)
    expect(result).toMatchObject({ failed: true, relevant: false, finding: '' })
  })

  it('flags a commit whose diff could not be loaded, without stopping the scan', async () => {
    const judge = vi.fn().mockResolvedValue(positive)
    const loadDiff = vi
      .fn()
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce('diff')

    const results = await scanCommits(
      [commit({ shortOid: 'c1' }), commit({ shortOid: 'c2' })],
      loadDiff,
      judge,
      params
    )

    expect(results[0]).toMatchObject({ failed: true })
    expect(results[1]).toMatchObject({ failed: false, relevant: true })
    expect(judge).toHaveBeenCalledTimes(1)
  })

  it('reports progress with the commit it is on, then the count it finished', async () => {
    const progress: CommitScanProgress[] = []
    await scanCommits(
      [commit({ shortOid: 'c1' }), commit({ shortOid: 'c2' })],
      () => Promise.resolve('d'),
      () => Promise.resolve(positive),
      params,
      { onProgress: (p) => progress.push({ ...p }) }
    )

    expect(progress[0]).toEqual({ phase: 'scanning', completed: 0, total: 2 })
    expect(progress).toContainEqual({ phase: 'scanning', completed: 0, total: 2, current: 'c1' })
    expect(progress.at(-1)).toEqual({ phase: 'scanning', completed: 2, total: 2 })
  })

  it('publishes each result as it lands, so the panel fills in during the run', async () => {
    const seen: ScannedCommit[] = []
    await scanCommits(
      [commit({ shortOid: 'c1' }), commit({ shortOid: 'c2' })],
      () => Promise.resolve('d'),
      () => Promise.resolve(positive),
      params,
      { onResult: (r) => seen.push(r) }
    )
    expect(seen.map((r) => r.commit.shortOid)).toEqual(['c1', 'c2'])
  })

  it('stops between commits when asked, without spending the rest of the run', async () => {
    const judge = vi.fn().mockResolvedValue(positive)
    let calls = 0

    await expect(
      scanCommits(
        [commit({ shortOid: 'c1' }), commit({ shortOid: 'c2' })],
        () => Promise.resolve('d'),
        judge,
        params,
        { shouldCancel: () => calls++ > 0 }
      )
    ).rejects.toThrow(SummaryRunCancelled)

    expect(judge).toHaveBeenCalledTimes(1)
  })

  it('returns nothing to read on an empty window rather than failing', async () => {
    const judge = vi.fn()
    expect(await scanCommits([], () => Promise.resolve('d'), judge, params)).toEqual([])
    expect(judge).not.toHaveBeenCalled()
  })
})
