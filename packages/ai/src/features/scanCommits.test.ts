import { describe, it, expect, vi } from 'vitest'
import type { ScanCommit } from '../config'
import { AiCallTimedOut } from './aiCallTimedOut'
import { CommitVerdictUnreadable, type CommitRelevanceResult } from './commitRelevance'
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
    expect(result).toMatchObject({ failed: true, relevant: false, finding: '', failure: 'call' })
  })

  /**
   * The three causes have three different fixes — change model, start the provider, look at the
   * repository — and the panel can only say which one happened if they are told apart here.
   */
  it('tells an unreadable answer apart from a provider that never answered', async () => {
    const judge = vi.fn().mockRejectedValue(new CommitVerdictUnreadable('not JSON, not labelled'))
    const [result] = await scanCommits([commit()], () => Promise.resolve('d'), judge, params)
    expect(result.failure).toBe('unreadable')
  })

  /**
   * The likeliest failure of a per-commit scan, and the only one with an obvious fix. On a real run
   * six of ten commits went unread, every one of them at exactly the configured 30 seconds, and the
   * panel could only call it "the provider did not answer".
   */
  it('tells a timeout apart from any other transport failure', async () => {
    const judge = vi.fn().mockRejectedValue(new AiCallTimedOut())
    const [result] = await scanCommits([commit()], () => Promise.resolve('d'), judge, params)
    expect(result.failure).toBe('timeout')
  })

  it('attributes a failed diff load to the repository, not the model', async () => {
    const judge = vi.fn()
    const [result] = await scanCommits(
      [commit()],
      () => Promise.reject(new Error('object missing')),
      judge,
      params
    )
    expect(result.failure).toBe('diff')
    expect(judge).not.toHaveBeenCalled()
  })

  it('leaves no failure reason on a commit that was read', async () => {
    const [result] = await scanCommits(
      [commit()],
      () => Promise.resolve('d'),
      () => Promise.resolve(positive),
      params
    )
    expect(result.failed).toBe(false)
    expect(result.failure).toBeUndefined()
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

    expect(progress[0]).toMatchObject({ phase: 'scanning', completed: 0, total: 2 })
    expect(progress).toContainEqual(
      expect.objectContaining({ phase: 'scanning', completed: 0, total: 2, current: 'c1' })
    )
    expect(progress.at(-1)).toMatchObject({ phase: 'scanning', completed: 2, total: 2 })
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

  it('reads several commits at once when told the provider can take them', async () => {
    const commits = ['c1', 'c2', 'c3', 'c4'].map((shortOid) => commit({ shortOid }))
    let inFlight = 0
    let peak = 0
    const judge = vi.fn(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight--
      return positive
    })

    const results = await scanCommits(commits, () => Promise.resolve('d'), judge, params, {
      concurrency: 3,
    })

    expect(peak).toBe(3)
    // History order survives whatever order the provider answered in — a scrambled list of commits
    // would be unreadable, and the answer's bullets are built from this.
    expect(results.map((r) => r.commit.shortOid)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  /** Above one in flight there is no single commit to name, and a plausible-looking one would lie. */
  it('names the commit being read only while there is one to name', async () => {
    const progress: CommitScanProgress[] = []
    await scanCommits(
      [commit({ shortOid: 'c1' }), commit({ shortOid: 'c2' })],
      () => Promise.resolve('d'),
      () => Promise.resolve(positive),
      params,
      { concurrency: 2, onProgress: (p) => progress.push({ ...p }) }
    )

    expect(progress.some((p) => p.current !== undefined)).toBe(false)
    expect(progress.at(-1)).toMatchObject({ phase: 'scanning', completed: 2, total: 2 })
  })

  it('reports each result with its place in history, since they can land out of order', async () => {
    const seen: Array<[string, number]> = []
    await scanCommits(
      [commit({ shortOid: 'c1' }), commit({ shortOid: 'c2' })],
      () => Promise.resolve('d'),
      () => Promise.resolve(positive),
      params,
      { concurrency: 2, onResult: (r, index) => seen.push([r.commit.shortOid, index]) }
    )

    expect(seen).toContainEqual(['c1', 0])
    expect(seen).toContainEqual(['c2', 1])
  })

  /**
   * The file is the unit that has to fit a prompt, because the commit's size is nobody's to control.
   * One way, always — a threshold would make one button mean two behaviours depending on a number
   * nobody can see.
   */
  describe('reading a commit file by file', () => {
    const threeFileDiff = ['a.ts', 'b.ts', 'c.ts']
      .map(
        (path) =>
          `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n+touched ${path}`
      )
      .join('\n')

    const threeFileCommit = commit({
      files: ['a.ts', 'b.ts', 'c.ts'].map((path) => ({ path, status: 'modified' })),
    })

    it('makes one call per file, each carrying only that file', async () => {
      const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
      const [result] = await scanCommits(
        [threeFileCommit],
        () => Promise.resolve(threeFileDiff),
        judge,
        params
      )

      expect(judge).toHaveBeenCalledTimes(3)
      expect(result.filesRead).toBe(3)
      const paths = judge.mock.calls.map((c) => c[0].files.map((f: { path: string }) => f.path))
      expect(paths).toEqual([['a.ts'], ['b.ts'], ['c.ts']])
      expect(judge.mock.calls[0][0].diff).toContain('a/a.ts')
      expect(judge.mock.calls[0][0].diff).not.toContain('a/b.ts')
    })

    /** Whatever the size: a small commit takes the same path as a large one, deliberately. */
    it('does it for a one-file commit too, rather than shortcutting', async () => {
      const judge = vi.fn().mockResolvedValue(positive)
      const [result] = await scanCommits(
        [commit({ files: [{ path: 'packages/ui/src/Button.tsx', status: 'modified' }] })],
        () =>
          Promise.resolve(
            'diff --git a/packages/ui/src/Button.tsx b/packages/ui/src/Button.tsx\n@@ -1 +1 @@\n+x'
          ),
        judge,
        params
      )

      expect(judge).toHaveBeenCalledTimes(1)
      expect(result.filesRead).toBe(1)
      expect(judge.mock.calls[0][0].files).toEqual([
        { path: 'packages/ui/src/Button.tsx', status: 'modified' },
      ])
    })

    /**
     * A measured run sent a 2 300-character body 22 times for one commit — two thirds of every
     * prompt, before the diff. The first paragraph carries the intent; the rest is per-file detail,
     * which is what the file's own diff is for.
     */
    it('carries the commit’s intent per file, not its whole body', async () => {
      const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
      const body = `The panel now hosts the rebase plan itself.\n\n${'Detail paragraph. '.repeat(60)}`

      await scanCommits(
        [commit({ ...threeFileCommit, body })],
        () => Promise.resolve(threeFileDiff),
        judge,
        params
      )

      const sent = judge.mock.calls[0][0].commit.body
      expect(sent).toBe('The panel now hosts the rebase plan itself.')
      expect(sent).not.toContain('Detail paragraph')
    })

    it('cuts an intent that is itself an essay', async () => {
      const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
      await scanCommits(
        [commit({ ...threeFileCommit, body: 'x'.repeat(2000) })],
        () => Promise.resolve(threeFileDiff),
        judge,
        params
      )

      expect(judge.mock.calls[0][0].commit.body.length).toBeLessThan(450)
      expect(judge.mock.calls[0][0].commit.body).toMatch(/…$/)
    })

    it('still tells the model what the commit was for, while it looks at one file', async () => {
      // The commit message is the intent; a file read without it is a diff with no purpose.
      const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
      await scanCommits([threeFileCommit], () => Promise.resolve(threeFileDiff), judge, params)

      expect(judge.mock.calls[0][0].commit).toMatchObject({
        shortOid: 'aaaaaaa',
        subject: 'feat: something',
      })
    })

    it('merges the file verdicts into the commit’s own, without spending another call', async () => {
      const judge = vi
        .fn()
        .mockResolvedValueOnce({ relevant: true, finding: 'adds the state', files: ['a.ts'] })
        .mockResolvedValueOnce({ relevant: false, finding: '', files: [] })
        .mockResolvedValueOnce({ relevant: true, finding: 'wires it up', files: ['c.ts'] })

      const [result] = await scanCommits(
        [threeFileCommit],
        () => Promise.resolve(threeFileDiff),
        judge,
        params
      )

      expect(judge).toHaveBeenCalledTimes(3)
      expect(result.relevant).toBe(true)
      // Sentences, not a run-on: these are shown verbatim next to the commit.
      expect(result.finding).toBe('adds the state. wires it up.')
      expect(result.files).toEqual(['a.ts', 'c.ts'])
    })

    /**
     * A partial read would let "not found in this commit" mean "not found in the files that happened
     * to answer" — the silent gap the per-commit design exists to prevent.
     */
    it('leaves the commit unread when any one of its files fails', async () => {
      const judge = vi
        .fn()
        .mockResolvedValueOnce({ relevant: false, finding: '', files: [] })
        .mockRejectedValueOnce(new CommitVerdictUnreadable('answered in prose'))
        .mockResolvedValueOnce({ relevant: true, finding: 'found it', files: ['c.ts'] })

      const [result] = await scanCommits(
        [threeFileCommit],
        () => Promise.resolve(threeFileDiff),
        judge,
        params
      )

      expect(result).toMatchObject({ failed: true, relevant: false, failure: 'unreadable' })
      expect(result.filesRead).toBe(0)
    })

    it('reads a diff with no file structure as the single unit it is', async () => {
      // No recognizable header: one section covering everything — the degenerate case of the same
      // loop, not a second way of reading. The model gets the commit's real file list.
      const judge = vi.fn().mockResolvedValue(positive)
      const [result] = await scanCommits(
        [threeFileCommit],
        () => Promise.resolve('a patch with no git header at all'),
        judge,
        params
      )

      expect(judge).toHaveBeenCalledTimes(1)
      expect(result.filesRead).toBe(1)
      expect(judge.mock.calls[0][0].files).toHaveLength(3)
    })

    /**
     * Per file, not per commit. A twenty-five-file commit is twenty-five calls, so a counter that
     * only moves when the commit finishes sits at zero for minutes — which is what "0 of 15" looked
     * like on the first real run.
     */
    it('moves the file counter during a commit, not only when it finishes', async () => {
      const progress: CommitScanProgress[] = []
      const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
      await scanCommits(
        [threeFileCommit],
        () => Promise.resolve(threeFileDiff),
        judge,
        params,
        { onProgress: (p) => progress.push({ ...p }) }
      )

      // The commit is still unfinished at 1 and 2 files: that is the whole point of the counter.
      expect(progress).toContainEqual(
        expect.objectContaining({ completed: 0, filesRead: 1, total: 1 })
      )
      expect(progress).toContainEqual(
        expect.objectContaining({ completed: 0, filesRead: 2, total: 1 })
      )
    })

    /**
     * The quick mode's second narrowing. Shortlisting commits alone left a measured run at
     * ninety-four file reads — one commit cost thirty-four — because picking five commits that
     * touch thirty files each saves almost nothing.
     */
    describe('narrowing which files to open', () => {
      it('opens only the paths the narrowing kept', async () => {
        const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
        const selectFiles = vi.fn().mockResolvedValue(['b.ts'])

        const [result] = await scanCommits(
          [threeFileCommit],
          () => Promise.resolve(threeFileDiff),
          judge,
          params,
          { selectFiles }
        )

        expect(selectFiles).toHaveBeenCalledWith(threeFileCommit, ['a.ts', 'b.ts', 'c.ts'])
        expect(judge).toHaveBeenCalledTimes(1)
        expect(judge.mock.calls[0][0].files).toEqual([{ path: 'b.ts', status: 'modified' }])
        expect(result.filesRead).toBe(1)
      })

      /** The deep search passes none, and must keep reading everything. */
      it('opens everything when no narrowing is supplied', async () => {
        const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
        await scanCommits([threeFileCommit], () => Promise.resolve(threeFileDiff), judge, params)
        expect(judge).toHaveBeenCalledTimes(3)
      })

      /**
       * Degrading into the slow behaviour is recoverable; degrading into a commit nobody looked at
       * is the exact silence the whole design exists to prevent.
       */
      it('falls back to opening everything when the narrowing fails', async () => {
        const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
        const selectFiles = vi.fn().mockRejectedValue(new Error('provider down'))

        const [result] = await scanCommits(
          [threeFileCommit],
          () => Promise.resolve(threeFileDiff),
          judge,
          params,
          { selectFiles }
        )

        expect(judge).toHaveBeenCalledTimes(3)
        expect(result.failed).toBe(false)
      })

      it('reads nothing when the narrowing keeps nothing', async () => {
        const judge = vi.fn()
        const [result] = await scanCommits(
          [threeFileCommit],
          () => Promise.resolve(threeFileDiff),
          judge,
          params,
          { selectFiles: () => Promise.resolve([]) }
        )

        expect(judge).not.toHaveBeenCalled()
        expect(result).toMatchObject({ relevant: false, failed: false, filesRead: 0 })
      })

      it('ignores a path the narrowing invented', async () => {
        const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
        await scanCommits([threeFileCommit], () => Promise.resolve(threeFileDiff), judge, params, {
          selectFiles: () => Promise.resolve(['a.ts', 'imagined.ts']),
        })
        expect(judge).toHaveBeenCalledTimes(1)
      })

      /** No path to judge it by, so it is not the narrowing's to reject. */
      it('keeps a diff with no file structure whatever the narrowing says', async () => {
        const judge = vi.fn().mockResolvedValue(positive)
        const selectFiles = vi.fn().mockResolvedValue([])

        await scanCommits(
          [threeFileCommit],
          () => Promise.resolve('a patch with no git header'),
          judge,
          params,
          { selectFiles }
        )

        expect(selectFiles).not.toHaveBeenCalled()
        expect(judge).toHaveBeenCalledTimes(1)
      })
    })

    it('counts the files read across the run, since that is what the wait is made of', async () => {
      const progress: CommitScanProgress[] = []
      const judge = vi.fn().mockResolvedValue({ relevant: false, finding: '', files: [] })
      await scanCommits(
        [threeFileCommit, threeFileCommit],
        () => Promise.resolve(threeFileDiff),
        judge,
        params,
        { onProgress: (p) => progress.push({ ...p }) }
      )

      expect(progress[0]).toMatchObject({ completed: 0, filesRead: 0 })
      expect(progress.at(-1)).toMatchObject({ completed: 2, total: 2, filesRead: 6 })
    })
  })

  it('returns nothing to read on an empty window rather than failing', async () => {
    const judge = vi.fn()
    expect(await scanCommits([], () => Promise.resolve('d'), judge, params)).toEqual([])
    expect(judge).not.toHaveBeenCalled()
  })
})
