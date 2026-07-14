import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const { generateDailySummary } = vi.hoisted(() => ({ generateDailySummary: vi.fn() }))
vi.mock('../lib/generateDailySummary', () => ({ generateDailySummary }))

import { useMorningSummaries } from './useMorningSummaries'
import { useDailySummaryStore } from '../stores/dailySummary.store'
import { useSettingsStore } from '../stores/settings.store'
import type { DailySummary } from '@git-manager/ai'

const INITIAL_SETTINGS = useSettingsStore.getState()
const summary: DailySummary = { headline: 'H', yesterday: [], today: [] }

function setDailySummarySettings(enabled: boolean, autoGenerate: boolean) {
  useSettingsStore.setState({
    settings: { ...INITIAL_SETTINGS.settings, dailySummary: { enabled, autoGenerate } },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  generateDailySummary.mockResolvedValue(summary)
  useDailySummaryStore.setState({ summaries: {} })
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
    const paths = generateDailySummary.mock.calls.map((c) => c[0])
    expect(paths).toEqual(['/repo/a', '/repo/b'])
  })

  it('skips paths whose summary was already generated today', async () => {
    setDailySummarySettings(true, true)
    useDailySummaryStore.getState().setSummary('/repo/a', summary) // fresh today
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
})
