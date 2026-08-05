import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardControlsStore } from './boardControls.store'

describe('boardControls.store', () => {
  beforeEach(() => {
    useBoardControlsStore.setState({ search: '', isOpen: false })
  })

  it('updates the search text', () => {
    useBoardControlsStore.getState().setSearch('header')
    expect(useBoardControlsStore.getState().search).toBe('header')
  })

  it('clears the search on reset', () => {
    useBoardControlsStore.getState().setSearch('header')
    useBoardControlsStore.getState().reset()
    expect(useBoardControlsStore.getState().search).toBe('')
  })

  it('toggles the board panel open state', () => {
    useBoardControlsStore.getState().setOpen(true)
    expect(useBoardControlsStore.getState().isOpen).toBe(true)
    useBoardControlsStore.getState().setOpen(false)
    expect(useBoardControlsStore.getState().isOpen).toBe(false)
  })
})
