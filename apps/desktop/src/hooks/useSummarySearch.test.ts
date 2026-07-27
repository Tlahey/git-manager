import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { run } = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../api/ai.api', () => ({ summarySearchService: { run } }))

import { useSummarySearch } from './useSummarySearch'
import type { StoredDailySummary } from '../stores/dailySummary.store'

function entry(overrides: Partial<StoredDailySummary> = {}): StoredDailySummary {
  return {
    repoPath: '/p/git-manager',
    repoName: 'git-manager',
    date: '2026-07-27',
    branch: 'origin/main',
    generatedAt: 0,
    commitCount: 1,
    fileCount: 1,
    filePath: '/archive/2026-07-27.md',
    summary: { headline: 'Shipped the merge editor', highlights: ['fixed a leak'] },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  run.mockResolvedValue({ answer: 'On the 27th.', matches: [] })
})

describe('useSummarySearch', () => {
  /** Searching is the model's job; the hook exposes no list-filtering of its own. */
  it('does nothing until asked a question', () => {
    const { result } = renderHook(() => useSummarySearch([entry()]))
    expect(run).not.toHaveBeenCalled()
    expect(result.current.answer).toBeNull()
  })

  it('sends the question and the shortlisted days as flattened text', async () => {
    const { result } = renderHook(() => useSummarySearch([entry()]))
    await act(async () => {
      await result.current.ask('when did I ship the merge editor?')
    })

    const input = run.mock.calls[0][1]
    expect(input.question).toBe('when did I ship the merge editor?')
    expect(input.candidates).toEqual([
      {
        repo: 'git-manager',
        date: '2026-07-27',
        text: 'Shipped the merge editor\nfixed a leak',
      },
    ])
    expect(result.current.answer).toEqual({ answer: 'On the 27th.', matches: [] })
  })

  /** The scorer is demoted to a shortlister: it picks which days the model reads. */
  it('ranks the shortlist by the question', async () => {
    const relevant = entry({ filePath: '/relevant.md' })
    const other = entry({
      filePath: '/other.md',
      date: '2026-07-20',
      summary: { headline: 'Bumped dependencies', highlights: [] },
    })
    const { result } = renderHook(() => useSummarySearch([other, relevant]))
    await act(async () => {
      await result.current.ask('merge editor')
    })
    expect(run.mock.calls[0][1].candidates[0].date).toBe('2026-07-27')
  })

  /** A question whose words appear nowhere still deserves an answer over the recent archive. */
  it('falls back to the recent archive when nothing matches the question', async () => {
    const { result } = renderHook(() => useSummarySearch([entry()]))
    await act(async () => {
      await result.current.ask('quantum tunnelling')
    })
    expect(run.mock.calls[0][1].candidates).toHaveLength(1)
  })

  it('caps the shortlist so the call stays bounded', async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      entry({ filePath: `/f${i}.md`, date: `2026-06-${String(i + 1).padStart(2, '0')}` })
    )
    const { result } = renderHook(() => useSummarySearch(many))
    await act(async () => {
      await result.current.ask('merge')
    })
    expect(run.mock.calls[0][1].candidates.length).toBeLessThanOrEqual(12)
  })

  it('ignores a blank question entirely', async () => {
    const { result } = renderHook(() => useSummarySearch([entry()]))
    await act(async () => {
      await result.current.ask('   ')
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('captures a model error and clears it on demand', async () => {
    run.mockRejectedValue(new Error('provider unreachable'))
    const { result } = renderHook(() => useSummarySearch([entry()]))
    await act(async () => {
      await result.current.ask('anything')
    })
    expect(result.current.askError).toContain('provider unreachable')
    expect(result.current.isAsking).toBe(false)

    act(() => result.current.clearAnswer())
    expect(result.current.askError).toBeNull()
  })
})
