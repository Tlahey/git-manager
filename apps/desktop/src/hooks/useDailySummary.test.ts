import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { generateDailySummary, apiListDailySummaries, apiDeleteDailySummary } = vi.hoisted(() => ({
  generateDailySummary: vi.fn(),
  apiListDailySummaries: vi.fn(),
  apiDeleteDailySummary: vi.fn(),
}))
vi.mock('../lib/generateDailySummary', () => ({ generateDailySummary }))
vi.mock('../api/dailySummary.api', () => ({ apiListDailySummaries, apiDeleteDailySummary }))

import { useDailySummary } from './useDailySummary'
import { useDailySummaryStore, type StoredDailySummary } from '../stores/dailySummary.store'
import { previousWorkingDayKey } from '../lib/dailySummaryWindow'
import { DEFAULT_TARGET_BRANCHES } from './useEffectiveRepoSettings'
import type { DailySummary } from '@git-manager/ai'

const summary: DailySummary = { headline: 'H', highlights: ['a'] }

function stored(overrides: Partial<StoredDailySummary> = {}): StoredDailySummary {
  return {
    repoPath: '/repo/a',
    repoName: 'a',
    date: previousWorkingDayKey(),
    branch: 'origin/main',
    generatedAt: Date.now(),
    commitCount: 1,
    fileCount: 1,
    filePath: '/archive/a/today.md',
    summary,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  apiListDailySummaries.mockResolvedValue([])
  useDailySummaryStore.setState({ entries: {}, hydrated: true })
})

describe('useDailySummary', () => {
  it('reports a missing briefing as stale with no data', () => {
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    expect(result.current.summary).toBeNull()
    expect(result.current.isStale).toBe(true)
    expect(result.current.isGenerating).toBe(false)
  })

  it('is fresh once the previous working day is archived, and exposes its file path', () => {
    useDailySummaryStore.getState().setSummary(stored())
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    expect(result.current.summary).toEqual(summary)
    expect(result.current.isStale).toBe(false)
    expect(result.current.filePath).toBe('/archive/a/today.md')
  })

  it('shows the newest day when several are archived', () => {
    const { setSummary } = useDailySummaryStore.getState()
    setSummary(stored({ date: '2020-01-01', generatedAt: 1, summary: { headline: 'Old', highlights: [] } }))
    setSummary(stored())
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    expect(result.current.summary?.headline).toBe('H')
  })

  it('reads the archive when the store has not been hydrated yet', async () => {
    useDailySummaryStore.setState({ entries: {}, hydrated: false })
    renderHook(() => useDailySummary('/repo/a'))
    await waitFor(() => expect(apiListDailySummaries).toHaveBeenCalled())
  })

  it('runs generation with the repo main-branch candidates, then clears the flag', async () => {
    generateDailySummary.mockResolvedValue(summary)
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    await act(async () => {
      await result.current.generate('2026-07-20')
    })
    expect(generateDailySummary).toHaveBeenCalledWith(
      '/repo/a',
      expect.anything(),
      expect.objectContaining({
        date: '2026-07-20',
        targetBranches: DEFAULT_TARGET_BRANCHES,
        saveToRepo: false,
      })
    )
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.skipped).toBe(false)
  })

  /** The launchpad panel's ✨ passes no day, and means "the one the morning run is about". */
  it('defaults to the previous working day when no date is given', async () => {
    generateDailySummary.mockResolvedValue(summary)
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    await act(async () => {
      await result.current.generate()
    })
    expect(generateDailySummary.mock.calls[0][2].date).toBe(previousWorkingDayKey())
  })

  /** A quiet repository and a broken provider must not look the same in the panel. */
  it('reports a skip when nothing landed in the window', async () => {
    generateDailySummary.mockResolvedValue(null)
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    await act(async () => {
      await result.current.generate()
    })
    expect(result.current.skipped).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('surfaces the map-phase progress while generating', async () => {
    let report: ((p: { phase: string; completed: number; total: number }) => void) | undefined
    generateDailySummary.mockImplementation(async (_path, _conn, options) => {
      report = options.onProgress
      return summary
    })
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    await act(async () => {
      await result.current.generate()
    })
    expect(report).toBeTypeOf('function')
  })

  it('captures a generation error', async () => {
    generateDailySummary.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    await act(async () => {
      await result.current.generate()
    })
    await waitFor(() => expect(result.current.error).toContain('boom'))
    expect(result.current.isGenerating).toBe(false)
  })
})
