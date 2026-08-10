import { describe, it, expect, beforeEach } from 'vitest'
import { useLaunchpadControlsStore } from './launchpadControls.store'

describe('launchpadControls.store', () => {
  beforeEach(() => {
    useLaunchpadControlsStore.setState({
      search: '',
      collapseAllNonce: 0,
      expandAllNonce: 0,
    })
  })

  it('updates the global search text', () => {
    useLaunchpadControlsStore.getState().setSearch('bug')
    expect(useLaunchpadControlsStore.getState().search).toBe('bug')
  })

  it('bumps the collapse and expand nonces independently', () => {
    const { collapseAll, expandAll } = useLaunchpadControlsStore.getState()
    collapseAll()
    collapseAll()
    expandAll()
    expect(useLaunchpadControlsStore.getState().collapseAllNonce).toBe(2)
    expect(useLaunchpadControlsStore.getState().expandAllNonce).toBe(1)
  })

  it('clears the search on reset', () => {
    useLaunchpadControlsStore.getState().setSearch('x')
    useLaunchpadControlsStore.getState().reset()
    expect(useLaunchpadControlsStore.getState().search).toBe('')
  })
})
