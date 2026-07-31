import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDevFixtures } from './useDevFixtures'
import { useDevFixturesStore, resetDevFixturesLoad } from '../stores/devFixtures.store'
import { useDevFlagsStore } from '../stores/devFlags.store'
import { useNotificationStore } from '../stores/notification.store'

beforeEach(() => {
  resetDevFixturesLoad()
  useDevFixturesStore.setState({ loaded: false, issues: [], contributions: [] })
  useNotificationStore.setState({ mockPRs: [] })
  useDevFlagsStore.setState({ mockGitHub: false })
})

describe('useDevFixtures', () => {
  it('loads nothing while the flag is off', async () => {
    renderHook(() => useDevFixtures())
    await waitFor(() => expect(useDevFixturesStore.getState().loaded).toBe(false))
    expect(useNotificationStore.getState().mockPRs).toEqual([])
  })

  it('returns an empty set while the flag is off', () => {
    const { result } = renderHook(() => useDevFixtures())
    expect(result.current.issues).toEqual([])
    expect(result.current.contributions).toEqual([])
  })

  it('loads them once the flag is on', async () => {
    useDevFlagsStore.setState({ mockGitHub: true })
    const { result } = renderHook(() => useDevFixtures())

    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
    expect(result.current.contributions).toHaveLength(365)
  })

  it('picks them up when the flag is switched on mid-session', async () => {
    // Which is what the footer's debug menu does — the flag is not only read at start-up.
    const { result, rerender } = renderHook(() => useDevFixtures())
    expect(result.current.issues).toEqual([])

    useDevFlagsStore.setState({ mockGitHub: true })
    rerender()

    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))
  })

  it('hides them again when the flag goes off, without unloading', async () => {
    useDevFlagsStore.setState({ mockGitHub: true })
    const { result, rerender } = renderHook(() => useDevFixtures())
    await waitFor(() => expect(result.current.issues.length).toBeGreaterThan(0))

    useDevFlagsStore.setState({ mockGitHub: false })
    rerender()

    expect(result.current.issues).toEqual([])
    expect(useDevFixturesStore.getState().issues.length).toBeGreaterThan(0)
  })

  it('does not fetch twice when two hooks mount together', async () => {
    // Both GitHub data hooks call this.
    useDevFlagsStore.setState({ mockGitHub: true })
    renderHook(() => useDevFixtures())
    renderHook(() => useDevFixtures())

    await waitFor(() => expect(useNotificationStore.getState().mockPRs.length).toBeGreaterThan(0))
    const ids = useNotificationStore.getState().mockPRs.map((pr) => pr.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
