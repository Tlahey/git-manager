import { describe, it, expect, beforeEach } from 'vitest'
import { useSidebarSearchStore } from './sidebarSearch.store'

beforeEach(() => {
  useSidebarSearchStore.setState({ focusToken: 0 })
})

describe('sidebarSearch.store', () => {
  it('starts at 0', () => {
    expect(useSidebarSearchStore.getState().focusToken).toBe(0)
  })

  it('requestFocus increments the token on every call', () => {
    useSidebarSearchStore.getState().requestFocus()
    expect(useSidebarSearchStore.getState().focusToken).toBe(1)
    useSidebarSearchStore.getState().requestFocus()
    expect(useSidebarSearchStore.getState().focusToken).toBe(2)
  })
})
