import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardControlsStore } from './boardControls.store'

describe('boardControls.store', () => {
  beforeEach(() => {
    useBoardControlsStore.getState().reset()
  })

  it('updates the board-list filter', () => {
    useBoardControlsStore.getState().setBoardFilter('sprint')
    expect(useBoardControlsStore.getState().boardFilter).toBe('sprint')
  })

  /** Finding a *ticket* is `BoardSearchDialog`'s job, across every board — this store narrows the
   * panel's board list and nothing else. */
  it('carries no card query', () => {
    expect(useBoardControlsStore.getState()).not.toHaveProperty('search')
  })

  it('toggles the closed and deleted board filters', () => {
    useBoardControlsStore.getState().setShowClosed(true)
    useBoardControlsStore.getState().setShowDeleted(true)

    expect(useBoardControlsStore.getState().showClosed).toBe(true)
    expect(useBoardControlsStore.getState().showDeleted).toBe(true)
  })

  it('clears the filter and both toggles on reset', () => {
    useBoardControlsStore.getState().setBoardFilter('sprint')
    useBoardControlsStore.getState().setShowClosed(true)
    useBoardControlsStore.getState().setShowDeleted(true)

    useBoardControlsStore.getState().reset()

    expect(useBoardControlsStore.getState()).toMatchObject({
      boardFilter: '',
      showClosed: false,
      showDeleted: false,
    })
  })
})
