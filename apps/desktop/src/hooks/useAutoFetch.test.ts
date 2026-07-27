import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoFetch } from './useAutoFetch'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useSettingsStore } from '../stores/settings.store'

const apiFetchRemote = vi.hoisted(() => vi.fn())
vi.mock('../api/git.api', () => ({
  apiFetchRemote: (...args: unknown[]) => apiFetchRemote(...args),
}))

const invalidateQueries = vi.hoisted(() => vi.fn())
vi.mock('../lib/queryClient', () => ({ queryClient: { invalidateQueries } }))

/** Sets the auto-fetch interval and prune flag without touching the rest of the settings. */
function setGitSettings(autoFetchIntervalMinutes: number, autoPrune = true) {
  const state = useSettingsStore.getState()
  useSettingsStore.setState({
    settings: {
      ...state.settings,
      git: { ...state.settings.git, autoFetchIntervalMinutes, autoPrune },
    },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  apiFetchRemote.mockReset().mockResolvedValue(undefined)
  invalidateQueries.mockReset()
  useRepoUIStore.setState({ activeRepo: '/repo' })
  setGitSettings(1)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Advances fake timers and lets the awaited fetch inside the tick settle. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useAutoFetch', () => {
  it('fetches the active repo once per configured interval', async () => {
    renderHook(() => useAutoFetch())
    expect(apiFetchRemote).not.toHaveBeenCalled()

    await advance(60_000)
    expect(apiFetchRemote).toHaveBeenCalledTimes(1)
    expect(apiFetchRemote).toHaveBeenLastCalledWith('/repo', undefined, true)

    await advance(60_000)
    expect(apiFetchRemote).toHaveBeenCalledTimes(2)
  })

  it('passes the autoPrune setting through to the fetch', async () => {
    setGitSettings(1, false)
    renderHook(() => useAutoFetch())

    await advance(60_000)
    expect(apiFetchRemote).toHaveBeenLastCalledWith('/repo', undefined, false)
  })

  it('honours a custom interval', async () => {
    setGitSettings(5)
    renderHook(() => useAutoFetch())

    await advance(60_000 * 4)
    expect(apiFetchRemote).not.toHaveBeenCalled()

    await advance(60_000)
    expect(apiFetchRemote).toHaveBeenCalledTimes(1)
  })

  it('is disabled by an interval of 0', async () => {
    setGitSettings(0)
    renderHook(() => useAutoFetch())

    await advance(60_000 * 10)
    expect(apiFetchRemote).not.toHaveBeenCalled()
  })

  it('does nothing without an active repository', async () => {
    useRepoUIStore.setState({ activeRepo: null })
    renderHook(() => useAutoFetch())

    await advance(60_000 * 3)
    expect(apiFetchRemote).not.toHaveBeenCalled()
  })

  it('does not fetch while the window is unfocused', async () => {
    renderHook(() => useAutoFetch())

    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    await advance(60_000 * 3)
    expect(apiFetchRemote).not.toHaveBeenCalled()
  })

  // The countdown is timestamp-based, so time spent unfocused still counts: coming back after more
  // than one interval fetches straight away instead of restarting a fresh minute.
  it('fetches on regaining focus when an interval already elapsed in the background', async () => {
    renderHook(() => useAutoFetch())

    act(() => {
      window.dispatchEvent(new Event('blur'))
    })
    await advance(60_000 * 2)
    expect(apiFetchRemote).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    // The re-armed timer's delay is already 0 — no interval left to wait out.
    await advance(0)
    expect(apiFetchRemote).toHaveBeenCalledTimes(1)
  })

  it('invalidates the branch and log queries of the fetched repo', async () => {
    renderHook(() => useAutoFetch())

    await advance(60_000)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['branches', '/repo'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['git-log', '/repo'] })
    // A fetch doesn't touch the working tree — the status query is left alone.
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ['git-status', '/repo'] })
  })

  it('stays silent when the remote is unreachable, and keeps scheduling', async () => {
    apiFetchRemote.mockRejectedValue(new Error('network is down'))
    renderHook(() => useAutoFetch())

    await advance(60_000)
    expect(apiFetchRemote).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).not.toHaveBeenCalled()

    await advance(60_000)
    expect(apiFetchRemote).toHaveBeenCalledTimes(2)
  })

  it('stops fetching once unmounted', async () => {
    const { unmount } = renderHook(() => useAutoFetch())
    unmount()

    await advance(60_000 * 3)
    expect(apiFetchRemote).not.toHaveBeenCalled()
  })
})
