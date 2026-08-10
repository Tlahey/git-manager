import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AiActivity, AiConnectionConfig, AiContext, DailySummary } from '@git-manager/ai'
import { COMPLETION_CANCELLED, SummaryRunCancelled } from '@git-manager/ai'

const {
  apiGetAiActivity,
  apiGetAiContext,
  composeRun,
  summarizeRun,
  summarizeCancel,
  apiSaveDailySummary,
} = vi.hoisted(() => ({
  apiGetAiActivity: vi.fn(),
  apiGetAiContext: vi.fn(),
  composeRun: vi.fn(),
  summarizeRun: vi.fn(),
  summarizeCancel: vi.fn(),
  apiSaveDailySummary: vi.fn(),
}))
vi.mock('../api/ai.api', () => ({
  apiGetAiActivity,
  apiGetAiContext,
  dailySummaryService: { run: composeRun },
  fileSummaryService: { run: summarizeRun, cancel: summarizeCancel },
}))
vi.mock('../api/dailySummary.api', () => ({
  apiSaveDailySummary,
  apiListDailySummaries: vi.fn().mockResolvedValue([]),
  apiDeleteDailySummary: vi.fn(),
}))

import { generateDailySummary } from './generateDailySummary'
import { useDailySummaryStore } from '../stores/dailySummary.store'

const connection = {
  preset: 'ollama',
  url: 'x',
  model: 'm',
  timeoutSeconds: 30,
} as AiConnectionConfig

const activity: AiActivity = {
  repoName: 'demo',
  branch: 'origin/main',
  commits: [
    {
      shortOid: 'abc1234',
      subject: 'feat: x',
      body: '',
      author: 'Ada',
      timestamp: 1,
      filesChanged: 1,
      insertions: 2,
      deletions: 0,
    },
  ],
  pending: [],
  truncated: false,
  baseOid: 'base',
  headOid: 'head',
}

const context: AiContext = {
  diff: '',
  repoName: 'demo',
  branch: 'origin/main',
  files: [{ path: 'src/a.ts', status: 'modified' }],
}

const summary: DailySummary = { headline: 'H', highlights: ['a'] }

const options = {
  date: '2026-07-27',
  targetBranches: ['origin/main'],
  saveToRepo: false,
  language: 'en',
}

beforeEach(() => {
  vi.clearAllMocks()
  useDailySummaryStore.setState({ entries: {}, hydrated: false })
  apiGetAiActivity.mockResolvedValue({ ...activity })
  apiGetAiContext.mockResolvedValue({ ...context })
  summarizeRun.mockResolvedValue({ intent: 'does a thing', area: 'demo' })
  composeRun.mockResolvedValue(summary)
  apiSaveDailySummary.mockResolvedValue('/home/.git-manager/summaries/demo/2026-07-27.md')
})

describe('generateDailySummary', () => {
  /** The window is exactly the requested calendar day, in the user's own time zone. */
  it('bounds the window to the requested day, over the main-branch candidates', async () => {
    await generateDailySummary('/repo/a', connection, options)

    const [path, since, until, candidates] = apiGetAiActivity.mock.calls[0]
    expect(path).toBe('/repo/a')
    // The repo's configured targets first, then their local equivalents: the backend has no HEAD
    // fallback, so without these a repo with no remote would report nothing at all.
    expect(candidates).toEqual(['origin/main', 'main', 'master'])
    expect(new Date(since * 1000).getDate()).toBe(27)
    expect(new Date(since * 1000).getHours()).toBe(0)
    expect(new Date(until * 1000).getDate()).toBe(27)
    expect(until - since).toBe(24 * 60 * 60 - 1)
  })

  /** A repo whose override already names a local branch must not get it twice. */
  it('does not repeat a candidate the repo already configured', async () => {
    await generateDailySummary('/repo/a', connection, { ...options, targetBranches: ['main'] })
    expect(apiGetAiActivity.mock.calls[0][3]).toEqual(['main', 'master'])
  })

  it('files the briefing under the day it is about, not the day it was written', async () => {
    await generateDailySummary('/repo/a', connection, options)
    expect(apiSaveDailySummary.mock.calls[0][1]).toBe('2026-07-27')
    expect(useDailySummaryStore.getState().entries['/repo/a']['2026-07-27']).toBeDefined()
  })

  it('fetches the window diff as a range between the reported oids', async () => {
    await generateDailySummary('/repo/a', connection, options)
    expect(apiGetAiContext).toHaveBeenCalledWith('/repo/a', 'range', 'base', 'head')
  })

  it('summarizes every changed file before composing the briefing', async () => {
    await generateDailySummary('/repo/a', connection, options)
    expect(summarizeRun).toHaveBeenCalledTimes(1)
    expect(composeRun).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({
        branch: 'origin/main',
        summaries: [{ path: 'src/a.ts', status: 'modified', intent: 'does a thing', area: 'demo' }],
      })
    )
  })

  it('injects the UI language into the activity before composing', async () => {
    await generateDailySummary('/repo/a', connection, { ...options, language: 'fr' })
    expect(composeRun).toHaveBeenCalledWith(connection, expect.objectContaining({ language: 'fr' }))
  })

  it('archives the briefing as markdown and indexes the returned path', async () => {
    const result = await generateDailySummary('/repo/a', connection, options)
    expect(result).toEqual(summary)

    const [repoPath, date, markdown, alsoInRepo] = apiSaveDailySummary.mock.calls[0]
    expect(repoPath).toBe('/repo/a')
    expect(date).toBe('2026-07-27')
    expect(markdown).toContain('repo: demo')
    expect(markdown).toContain('H')
    expect(alsoInRepo).toBe(false)

    const stored = useDailySummaryStore.getState().entries['/repo/a'][date]
    expect(stored.summary).toEqual(summary)
    expect(stored.filePath).toBe('/home/.git-manager/summaries/demo/2026-07-27.md')
    expect(stored.commitCount).toBe(1)
    expect(stored.fileCount).toBe(1)
  })

  it('passes the in-repo copy preference through', async () => {
    await generateDailySummary('/repo/a', connection, { ...options, saveToRepo: true })
    expect(apiSaveDailySummary.mock.calls[0][3]).toBe(true)
  })

  /** A quiet repository is the common case on any given morning, and it must cost no tokens. */
  it('skips entirely — no model call, no file — when nothing landed in the window', async () => {
    apiGetAiActivity.mockResolvedValue({ ...activity, commits: [], baseOid: null, headOid: null })

    expect(await generateDailySummary('/repo/a', connection, options)).toBeNull()
    expect(apiGetAiContext).not.toHaveBeenCalled()
    expect(summarizeRun).not.toHaveBeenCalled()
    expect(composeRun).not.toHaveBeenCalled()
    expect(apiSaveDailySummary).not.toHaveBeenCalled()
  })

  it('skips when the window has commits but they changed no files', async () => {
    apiGetAiContext.mockResolvedValue({ ...context, files: [] })

    expect(await generateDailySummary('/repo/a', connection, options)).toBeNull()
    expect(composeRun).not.toHaveBeenCalled()
    expect(apiSaveDailySummary).not.toHaveBeenCalled()
  })

  /**
   * The briefing is one model call per changed file and nobody presses anything to start it — the
   * morning run starts itself, and the panel can be navigated away from. So stopping it has to
   * reach a call already sent, which is the whole of what these two assert.
   */
  describe('stopping a run', () => {
    it('dispatches each file summary under the id the run can cancel it by', async () => {
      await generateDailySummary('/repo/a', connection, options)

      // Third argument, and not merely present: a `summarize` that ignored it would dispatch under
      // an id nothing is tracking, and cancelling would then reach nothing at all. That was the bug.
      const requestId = summarizeRun.mock.calls[0]![2]
      expect(typeof requestId).toBe('string')
      expect(requestId).not.toBe('')
    })

    it('aborts the call in flight, by that id, and reports the stop as a stop', async () => {
      let stop = false
      let dispatched: string | undefined
      let rejectCall: ((error: Error) => void) | undefined
      // Parked: nothing else is dispatched, so a poll that only ran between calls would never fire.
      summarizeRun.mockImplementation((_c: unknown, _i: unknown, requestId: string) => {
        dispatched = requestId
        stop = true
        return new Promise<never>((_resolve, reject) => {
          rejectCall = reject
        })
      })
      // What the canceller does for real: reaching the backend is what makes the request in flight
      // fail, carrying the marker that tells a stop apart from a provider error.
      summarizeCancel.mockImplementation((requestId: string) => {
        if (requestId === dispatched) rejectCall?.(new Error(COMPLETION_CANCELLED))
        return Promise.resolve()
      })

      const run = generateDailySummary('/repo/a', connection, {
        ...options,
        shouldCancel: () => stop,
      })

      await expect(run).rejects.toBeInstanceOf(SummaryRunCancelled)
      expect(summarizeCancel).toHaveBeenCalledWith(dispatched)
      // A cancelled run writes nothing: a briefing built from a half-read window would be archived
      // as if it were complete.
      expect(composeRun).not.toHaveBeenCalled()
      expect(apiSaveDailySummary).not.toHaveBeenCalled()
    })
  })
})
