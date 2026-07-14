import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { generateDailySummary } = vi.hoisted(() => ({ generateDailySummary: vi.fn() }))
vi.mock('../lib/generateDailySummary', () => ({ generateDailySummary }))

import { useDailySummary } from './useDailySummary'
import { useDailySummaryStore } from '../stores/dailySummary.store'
import type { DailySummary } from '@git-manager/ai'

const summary: DailySummary = { headline: 'H', yesterday: ['a'], today: ['b'] }

beforeEach(() => {
  vi.clearAllMocks()
  useDailySummaryStore.setState({ summaries: {} })
})

describe('useDailySummary', () => {
  it('reports a missing summary as stale with no data', () => {
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    expect(result.current.summary).toBeNull()
    expect(result.current.isStale).toBe(true)
    expect(result.current.isGenerating).toBe(false)
  })

  it('exposes a stored summary as fresh', () => {
    useDailySummaryStore.getState().setSummary('/repo/a', summary)
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    expect(result.current.summary).toEqual(summary)
    expect(result.current.isStale).toBe(false)
  })

  it('runs generation and clears the generating flag afterwards', async () => {
    generateDailySummary.mockResolvedValue(summary)
    const { result } = renderHook(() => useDailySummary('/repo/a'))
    await act(async () => {
      await result.current.generate()
    })
    expect(generateDailySummary).toHaveBeenCalledWith('/repo/a', expect.anything(), expect.any(String))
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
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
