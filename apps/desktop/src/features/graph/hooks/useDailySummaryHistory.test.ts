import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { SWRConfig } from 'swr'

const { apiListDailySummaries, apiDeleteDailySummary } = vi.hoisted(() => ({
  apiListDailySummaries: vi.fn(),
  apiDeleteDailySummary: vi.fn(),
}))
vi.mock('../../../api/dailySummary.api', () => ({ apiListDailySummaries, apiDeleteDailySummary }))

import { useDailySummaryHistory } from './useDailySummaryHistory'
import { useDailySummaryStore } from '../../../stores/dailySummary.store'

/**
 * A fresh SWR cache per render.
 *
 * The hook's key is a constant (there is one archive), so the global cache would carry the first
 * test's result into every later one — the fetcher never re-runs, `hydrate()` never repopulates the
 * store `beforeEach` just emptied, and the hook reports an empty archive. `dedupingInterval: 0`
 * covers the same hazard within a single test.
 */
function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children
  )
}

function file(date: string, repoPath: string, repoName: string, headline = 'H') {
  return {
    repoPath,
    repoName,
    date,
    filePath: `/archive/${repoName}/${date}.md`,
    markdown: `---\nrepo: ${repoName}\nrepoPath: ${repoPath}\ndate: ${date}\nbranch: origin/main\ngeneratedAt: 2026-07-27T08:00:00.000Z\ncommits: 1\nfiles: 1\n---\n\n# ${date}\n\n${headline}\n\n## Yesterday\n\n- a\n`,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useDailySummaryStore.setState({ entries: {}, hydrated: false })
  apiListDailySummaries.mockResolvedValue([])
})

describe('useDailySummaryHistory', () => {
  it('reads the archive and exposes the parsed entries newest first', async () => {
    apiListDailySummaries.mockResolvedValue([
      file('2026-07-20', '/p/a', 'a', 'Older'),
      file('2026-07-27', '/p/a', 'a', 'Newest'),
    ])

    const { result } = renderHook(() => useDailySummaryHistory(), { wrapper })
    await waitFor(() => expect(result.current.entries).toHaveLength(2))
    expect(result.current.entries.map((e) => e.summary.headline)).toEqual(['Newest', 'Older'])
  })

  /** The read is global, but a repo-scoped panel must never see another project's days. */
  it('returns only the requested repository, newest first', async () => {
    apiListDailySummaries.mockResolvedValue([
      file('2026-07-27', '/p/z', 'zeta', 'Other project'),
      file('2026-07-27', '/p/a', 'alpha', 'Newest'),
      file('2026-07-20', '/p/a', 'alpha', 'Older'),
    ])

    const { result } = renderHook(() => useDailySummaryHistory('/p/a'), { wrapper })
    await waitFor(() => expect(result.current.entries).toHaveLength(2))
    expect(result.current.entries.map((e) => e.summary.headline)).toEqual(['Newest', 'Older'])
  })

  it('returns nothing for a repository with no archived day', async () => {
    apiListDailySummaries.mockResolvedValue([file('2026-07-27', '/p/a', 'alpha')])
    const { result } = renderHook(() => useDailySummaryHistory('/p/none'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.entries).toEqual([])
  })

  /** The store is the shared index, so a briefing written elsewhere must appear without a re-read. */
  it('reflects a briefing added to the store directly', async () => {
    const { result } = renderHook(() => useDailySummaryHistory(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      useDailySummaryStore.getState().setSummary({
        repoPath: '/p/new',
        repoName: 'new',
        date: '2026-07-27',
        branch: 'origin/main',
        generatedAt: 1,
        commitCount: 1,
        fileCount: 1,
        filePath: '/archive/new.md',
        summary: { headline: 'Just generated', highlights: [] },
      })
    })

    await waitFor(() => expect(result.current.entries).toHaveLength(1))
  })

  it('deletes a briefing through the store and refreshes', async () => {
    apiListDailySummaries.mockResolvedValue([file('2026-07-27', '/p/a', 'a')])
    const { result } = renderHook(() => useDailySummaryHistory(), { wrapper })
    await waitFor(() => expect(result.current.entries).toHaveLength(1))

    apiListDailySummaries.mockResolvedValue([])
    await act(async () => {
      await result.current.remove(result.current.entries[0])
    })

    expect(apiDeleteDailySummary).toHaveBeenCalledWith('/archive/a/2026-07-27.md')
    await waitFor(() => expect(result.current.entries).toHaveLength(0))
  })

  it('surfaces a read failure instead of hanging on the loading state', async () => {
    apiListDailySummaries.mockRejectedValue(new Error('unreadable archive'))
    const { result } = renderHook(() => useDailySummaryHistory(), { wrapper })
    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.entries).toEqual([])
  })
})
