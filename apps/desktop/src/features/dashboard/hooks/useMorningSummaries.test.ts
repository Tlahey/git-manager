import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const { generateDailySummary, apiListDailySummaries, apiDeleteDailySummary } = vi.hoisted(() => ({
  generateDailySummary: vi.fn(),
  apiListDailySummaries: vi.fn(),
  apiDeleteDailySummary: vi.fn(),
}))
vi.mock('../../../lib/generateDailySummary', () => ({ generateDailySummary }))
vi.mock('../../../api/dailySummary.api', () => ({ apiListDailySummaries, apiDeleteDailySummary }))

import { useMorningSummaries } from './useMorningSummaries'
import { useDailySummaryStore, type StoredDailySummary } from '../../../stores/dailySummary.store'
import { useAiActivityStore } from '../../../stores/aiActivity.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { DEFAULT_TARGET_BRANCHES } from '../../../hooks/useEffectiveRepoSettings'
import { previousWorkingDayKey } from '../../../lib/dailySummaryWindow'
import { SummaryRunCancelled, type DailySummary } from '@git-manager/ai'

const INITIAL_SETTINGS = useSettingsStore.getState()
const summary: DailySummary = { headline: 'H', highlights: [] }

function setDailySummarySettings(enabled: boolean, autoGenerate: boolean) {
  useSettingsStore.setState({
    settings: {
      ...INITIAL_SETTINGS.settings,
      dailySummary: { enabled, autoGenerate, saveToRepo: false },
    },
  })
}

/** A briefing already archived for the day the morning run targets, so the path looks fresh. */
function freshToday(repoPath: string): StoredDailySummary {
  return {
    repoPath,
    repoName: repoPath.split('/').pop() ?? repoPath,
    date: previousWorkingDayKey(),
    branch: 'origin/main',
    generatedAt: Date.now(),
    commitCount: 1,
    fileCount: 1,
    filePath: `/archive/${repoPath}.md`,
    summary,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  generateDailySummary.mockResolvedValue(summary)
  apiListDailySummaries.mockResolvedValue([])
  useDailySummaryStore.setState({ entries: {}, hydrated: true })
  useAiActivityStore.setState({ runs: [], progress: null })
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

afterEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
})

describe('useMorningSummaries', () => {
  it('generates for stale paths when enabled + auto-generate are on', async () => {
    setDailySummarySettings(true, true)
    renderHook(() => useMorningSummaries(['/repo/a', '/repo/b']))
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(2))
    expect(generateDailySummary.mock.calls.map((c) => c[0])).toEqual(['/repo/a', '/repo/b'])
  })

  it('passes the repo main-branch candidates and the in-repo preference', async () => {
    setDailySummarySettings(true, true)
    renderHook(() => useMorningSummaries(['/repo/a']))
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(1))
    expect(generateDailySummary.mock.calls[0][2]).toMatchObject({
      // The run is about a day, and that day is the previous working one.
      date: previousWorkingDayKey(),
      targetBranches: DEFAULT_TARGET_BRANCHES,
      saveToRepo: false,
    })
  })

  /**
   * The run nobody is watching is the one that most needs to say what it is: it starts itself, so a
   * card named after the calls it happens to be making ("reading the files one by one") is the one
   * the user cannot attribute to any button they pressed.
   */
  it('reports its progress as the briefing’s, though no panel is watching', async () => {
    setDailySummarySettings(true, true)
    renderHook(() => useMorningSummaries(['/repo/a']))
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(1))

    generateDailySummary.mock.calls[0][2].onProgress({
      phase: 'summarizing',
      completed: 2,
      total: 7,
    })
    expect(useAiActivityStore.getState().progress).toEqual({
      featureId: 'file-summary',
      owner: 'daily-summary',
      completed: 2,
      total: 7,
    })
  })

  it('honours a per-repo target-branch override', async () => {
    useSettingsStore.setState({
      settings: {
        ...INITIAL_SETTINGS.settings,
        dailySummary: { enabled: true, autoGenerate: true, saveToRepo: false },
        repoOverrides: { '/repo/a': { targetBranches: ['origin/develop'] } },
      },
    })
    renderHook(() => useMorningSummaries(['/repo/a']))
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(1))
    expect(generateDailySummary.mock.calls[0][2].targetBranches).toEqual(['origin/develop'])
  })

  it('skips paths whose briefing was already archived today', async () => {
    setDailySummarySettings(true, true)
    useDailySummaryStore.getState().setSummary(freshToday('/repo/a'))
    renderHook(() => useMorningSummaries(['/repo/a', '/repo/b']))
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(1))
    expect(generateDailySummary.mock.calls[0][0]).toBe('/repo/b')
  })

  /** After a restart the store is empty but the archive isn't, so it has to be read first. */
  it('reads the archive before deciding what is stale', async () => {
    setDailySummarySettings(true, true)
    useDailySummaryStore.setState({ entries: {}, hydrated: false })
    apiListDailySummaries.mockResolvedValue([
      {
        repoPath: '/repo/a',
        repoName: 'a',
        date: previousWorkingDayKey(),
        filePath: '/archive/a.md',
        markdown: `---\nrepo: a\nrepoPath: /repo/a\ndate: ${previousWorkingDayKey()}\ngeneratedAt: ${new Date().toISOString()}\n---\n\n# t\n\nH\n`,
      },
    ])

    renderHook(() => useMorningSummaries(['/repo/a', '/repo/b']))
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(1))
    expect(generateDailySummary.mock.calls[0][0]).toBe('/repo/b')
  })

  it('does nothing when the feature is disabled', async () => {
    setDailySummarySettings(false, true)
    renderHook(() => useMorningSummaries(['/repo/a']))
    await new Promise((r) => setTimeout(r, 20))
    expect(generateDailySummary).not.toHaveBeenCalled()
  })

  it('does nothing when auto-generate is off', async () => {
    setDailySummarySettings(true, false)
    renderHook(() => useMorningSummaries(['/repo/a']))
    await new Promise((r) => setTimeout(r, 20))
    expect(generateDailySummary).not.toHaveBeenCalled()
  })

  it('does not re-run for a path already attempted this session', async () => {
    setDailySummarySettings(true, true)
    const { rerender } = renderHook(({ paths }) => useMorningSummaries(paths), {
      initialProps: { paths: ['/repo/a'] },
    })
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(1))
    rerender({ paths: ['/repo/a'] })
    await new Promise((r) => setTimeout(r, 20))
    expect(generateDailySummary).toHaveBeenCalledTimes(1)
  })

  /** A skipped (quiet) repo must not be retried all session either. */
  it('does not retry a path that produced no briefing', async () => {
    setDailySummarySettings(true, true)
    generateDailySummary.mockResolvedValue(null)
    const { rerender } = renderHook(({ paths }) => useMorningSummaries(paths), {
      initialProps: { paths: ['/repo/a'] },
    })
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(1))
    rerender({ paths: ['/repo/a'] })
    await new Promise((r) => setTimeout(r, 20))
    expect(generateDailySummary).toHaveBeenCalledTimes(1)
  })

  it('carries on with the other projects when one fails', async () => {
    setDailySummarySettings(true, true)
    generateDailySummary.mockRejectedValueOnce(new Error('provider down'))
    renderHook(() => useMorningSummaries(['/repo/a', '/repo/b']))
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(2))
  })

  /**
   * The run is one model call per changed file and nothing on screen is watching it, so leaving the
   * dashboard used to abandon the loop and leave the model working — for minutes, on a briefing
   * nobody would ever see. The flag now reaches the run itself.
   */
  it('tells the run in flight to stop when the dashboard goes away', async () => {
    setDailySummarySettings(true, true)
    generateDailySummary.mockReturnValue(new Promise(() => {}))
    const { unmount } = renderHook(() => useMorningSummaries(['/repo/a']))
    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(1))

    const shouldCancel = generateDailySummary.mock.calls[0]![2].shouldCancel as () => boolean
    expect(shouldCancel()).toBe(false)

    unmount()
    expect(shouldCancel()).toBe(true)
  })

  it('stops the whole sweep on a cancellation rather than moving to the next project', async () => {
    // A stop means the dashboard is gone: carrying on to the next repository would start work for
    // a surface that no longer exists, which is what the teardown was trying to end.
    setDailySummarySettings(true, true)
    generateDailySummary.mockRejectedValueOnce(new SummaryRunCancelled())
    renderHook(() => useMorningSummaries(['/repo/a', '/repo/b']))

    await waitFor(() => expect(generateDailySummary).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(generateDailySummary).toHaveBeenCalledTimes(1)
  })
})
