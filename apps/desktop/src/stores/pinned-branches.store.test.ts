import { describe, it, expect, beforeEach } from 'vitest'
import { usePinnedBranchesStore } from './pinned-branches.store'

beforeEach(() => {
  usePinnedBranchesStore.setState({ overrides: {} })
  localStorage.clear()
})

describe('usePinnedBranchesStore', () => {
  it('starts with no overrides', () => {
    expect(usePinnedBranchesStore.getState().overrides).toEqual({})
  })

  it('setPin records an explicit pin for a branch under its repo', () => {
    usePinnedBranchesStore.getState().setPin('/repo/a', 'feature-x', true)
    expect(usePinnedBranchesStore.getState().overrides).toEqual({
      '/repo/a': { 'feature-x': true },
    })
  })

  it('setPin records an explicit unpin', () => {
    usePinnedBranchesStore.getState().setPin('/repo/a', 'main', false)
    expect(usePinnedBranchesStore.getState().overrides['/repo/a'].main).toBe(false)
  })

  it('keeps overrides for other branches in the same repo when setting a new one', () => {
    usePinnedBranchesStore.getState().setPin('/repo/a', 'feature-x', true)
    usePinnedBranchesStore.getState().setPin('/repo/a', 'feature-y', false)
    expect(usePinnedBranchesStore.getState().overrides['/repo/a']).toEqual({
      'feature-x': true,
      'feature-y': false,
    })
  })

  it('keeps overrides isolated per repo', () => {
    usePinnedBranchesStore.getState().setPin('/repo/a', 'main', true)
    usePinnedBranchesStore.getState().setPin('/repo/b', 'main', false)
    expect(usePinnedBranchesStore.getState().overrides).toEqual({
      '/repo/a': { main: true },
      '/repo/b': { main: false },
    })
  })

  it('overwrites a prior override for the same repo/branch pair', () => {
    usePinnedBranchesStore.getState().setPin('/repo/a', 'main', true)
    usePinnedBranchesStore.getState().setPin('/repo/a', 'main', false)
    expect(usePinnedBranchesStore.getState().overrides['/repo/a'].main).toBe(false)
  })

  it('persists to localStorage under its own key', () => {
    usePinnedBranchesStore.getState().setPin('/repo/a', 'main', true)
    const raw = localStorage.getItem('git-manager-pinned-branches')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).state.overrides).toEqual({ '/repo/a': { main: true } })
  })
})
