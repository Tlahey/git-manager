import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardControlsStore } from './boardControls.store'

describe('boardControls.store', () => {
  beforeEach(() => {
    useBoardControlsStore.getState().reset()
  })

  it('updates the search text', () => {
    useBoardControlsStore.getState().setSearch('header')
    expect(useBoardControlsStore.getState().search).toBe('header')
  })

  it('toggles the closed and deleted board filters', () => {
    useBoardControlsStore.getState().setShowClosed(true)
    useBoardControlsStore.getState().setShowDeleted(true)

    expect(useBoardControlsStore.getState().showClosed).toBe(true)
    expect(useBoardControlsStore.getState().showDeleted).toBe(true)
  })

  it('clears the search and both filters on reset', () => {
    useBoardControlsStore.getState().setSearch('header')
    useBoardControlsStore.getState().setShowClosed(true)
    useBoardControlsStore.getState().setShowDeleted(true)

    useBoardControlsStore.getState().reset()

    expect(useBoardControlsStore.getState()).toMatchObject({
      search: '',
      showClosed: false,
      showDeleted: false,
    })
  })
})
