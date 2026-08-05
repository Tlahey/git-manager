import { describe, it, expect, beforeEach } from 'vitest'
import { useDevFixturesStore, resetDevFixturesLoad } from './devFixtures.store'
import { useNotificationStore } from './notification.store'

beforeEach(() => {
  resetDevFixturesLoad()
  useDevFixturesStore.setState({ loaded: false, issues: [], contributions: [] })
  useNotificationStore.setState({ mockPRs: [] })
})

describe('useDevFixturesStore', () => {
  it('starts with nothing, because the fixtures arrive asynchronously', () => {
    const state = useDevFixturesStore.getState()
    expect(state.loaded).toBe(false)
    expect(state.issues).toEqual([])
    expect(state.contributions).toEqual([])
  })

  it('fills the issues and the contribution history', async () => {
    await useDevFixturesStore.getState().load()

    const state = useDevFixturesStore.getState()
    expect(state.loaded).toBe(true)
    expect(state.issues.length).toBeGreaterThan(0)
    expect(state.contributions).toHaveLength(365)
  })

  it('seeds the pull requests into the notification store, where their mutator lives', async () => {
    // They live next to `simulateChange` and the watcher's poll-to-poll diff; splitting them from
    // their mutator would mean keeping two copies in step.
    await useDevFixturesStore.getState().load()
    expect(useNotificationStore.getState().mockPRs.length).toBeGreaterThan(0)
  })

  it('does not re-seed on a second call, which would undo the simulated changes', async () => {
    await useDevFixturesStore.getState().load()
    const target = useNotificationStore.getState().mockPRs[0].id
    useNotificationStore.getState().simulateChange(target, 'merge')

    await useDevFixturesStore.getState().load()

    expect(useNotificationStore.getState().mockPRs.find((pr) => pr.id === target)?.status).toBe(
      'merged'
    )
  })

  it('shares one load between callers that ask at the same moment', async () => {
    // Both GitHub data hooks call this, and either may mount first.
    const [a, b] = [useDevFixturesStore.getState().load(), useDevFixturesStore.getState().load()]
    await Promise.all([a, b])

    // A second fetch would have re-seeded and wiped nothing yet, so the observable proof is that
    // the pull requests were not duplicated.
    const ids = useNotificationStore.getState().mockPRs.map((pr) => pr.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
