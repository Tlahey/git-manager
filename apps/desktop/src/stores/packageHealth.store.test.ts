import { describe, it, expect, beforeEach } from 'vitest'
import { usePackageHealthStore } from './packageHealth.store'

describe('packageHealth.store', () => {
  beforeEach(() => {
    usePackageHealthStore.setState({ open: false, selection: { kind: 'overview' } })
  })

  it('opens on the overview', () => {
    usePackageHealthStore.getState().openTool()
    expect(usePackageHealthStore.getState().open).toBe(true)
    expect(usePackageHealthStore.getState().selection).toEqual({ kind: 'overview' })
  })

  it('selects a check for the center pane', () => {
    usePackageHealthStore.getState().openTool()
    usePackageHealthStore.getState().select({ kind: 'check', id: 'versionAlignment' })
    expect(usePackageHealthStore.getState().selection).toEqual({
      kind: 'check',
      id: 'versionAlignment',
    })
  })

  it('resets the selection on close, so reopening never lands on a stale check', () => {
    usePackageHealthStore.getState().openTool()
    usePackageHealthStore.getState().select({ kind: 'check', id: 'catalogDrift' })
    usePackageHealthStore.getState().close()

    expect(usePackageHealthStore.getState().open).toBe(false)
    expect(usePackageHealthStore.getState().selection).toEqual({ kind: 'overview' })
  })
})
