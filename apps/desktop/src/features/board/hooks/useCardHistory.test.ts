import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { CardHistoryEntry } from '@git-manager/git-types'
import { makeCard } from '../test/boardFactories'
import { useCardHistory } from './useCardHistory'

function entry(overrides: Partial<CardHistoryEntry> = {}): CardHistoryEntry {
  return {
    oid: 'abc1234',
    shortOid: 'abc1234',
    authorName: 'Ada',
    authorEmail: 'ada@example.com',
    timestamp: 1_700_000_000,
    kind: 'created',
    changes: [],
    ...overrides,
  }
}

describe('useCardHistory', () => {
  it('starts empty and not loading when no card is open', () => {
    const load = vi.fn()
    const { result } = renderHook(() => useCardHistory(null, load))
    expect(result.current.history).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(load).not.toHaveBeenCalled()
  })

  it('loads the open card’s history', async () => {
    const card = makeCard()
    const history = [entry()]
    const load = vi.fn().mockResolvedValue(history)

    const { result } = renderHook(() => useCardHistory(card, load))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.history).toEqual(history)
    expect(load).toHaveBeenCalledWith(card)
  })

  it('reloads when the card’s revision changes, not on every render', async () => {
    const card = makeCard({ revision: 'rev-1' })
    const load = vi.fn().mockResolvedValue([])
    const { rerender } = renderHook(({ c }) => useCardHistory(c, load), {
      initialProps: { c: card },
    })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))

    // Same id and revision — a re-render for an unrelated reason must not re-fetch.
    rerender({ c: { ...card } })
    expect(load).toHaveBeenCalledTimes(1)

    // A new revision (a mutation landed) does re-fetch.
    rerender({ c: { ...card, revision: 'rev-2' } })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })

  it('clears the history when the card is closed', async () => {
    const card = makeCard()
    const load = vi.fn().mockResolvedValue([entry()])
    const { result, rerender } = renderHook(({ c }) => useCardHistory(c, load), {
      initialProps: { c: card as typeof card | null },
    })
    await waitFor(() => expect(result.current.history).toHaveLength(1))

    rerender({ c: null })
    expect(result.current.history).toEqual([])
  })
})
