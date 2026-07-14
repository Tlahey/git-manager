import { describe, it, expect, beforeEach } from 'vitest'
import type { DailySummary } from '@git-manager/ai'
import { useDailySummaryStore } from './dailySummary.store'

const summary: DailySummary = {
  headline: 'Shipped the thing',
  yesterday: ['did a'],
  today: ['do b'],
}

describe('useDailySummaryStore', () => {
  beforeEach(() => {
    useDailySummaryStore.setState({ summaries: {} })
  })

  it('stores a summary per path with a generatedAt timestamp', () => {
    const before = Date.now()
    useDailySummaryStore.getState().setSummary('/repo/a', summary)
    const stored = useDailySummaryStore.getState().summaries['/repo/a']
    expect(stored.summary).toEqual(summary)
    expect(stored.generatedAt).toBeGreaterThanOrEqual(before)
  })

  it('keeps summaries isolated per project', () => {
    const { setSummary } = useDailySummaryStore.getState()
    setSummary('/repo/a', summary)
    setSummary('/repo/b', { ...summary, headline: 'Other' })
    const state = useDailySummaryStore.getState().summaries
    expect(state['/repo/a'].summary.headline).toBe('Shipped the thing')
    expect(state['/repo/b'].summary.headline).toBe('Other')
  })

  it('clears a single project summary and no-ops on unknown paths', () => {
    const { setSummary, clearSummary } = useDailySummaryStore.getState()
    setSummary('/repo/a', summary)
    clearSummary('/repo/missing') // no-op, no throw
    expect(useDailySummaryStore.getState().summaries['/repo/a']).toBeDefined()
    clearSummary('/repo/a')
    expect(useDailySummaryStore.getState().summaries['/repo/a']).toBeUndefined()
  })
})
