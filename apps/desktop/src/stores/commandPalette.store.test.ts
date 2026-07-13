import { describe, it, expect, beforeEach } from 'vitest'
import { useCommandPaletteStore } from './commandPalette.store'

beforeEach(() => {
  useCommandPaletteStore.setState({ open: false })
})

describe('commandPalette.store', () => {
  it('starts closed', () => {
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })

  it('openPalette / closePalette set the flag', () => {
    useCommandPaletteStore.getState().openPalette()
    expect(useCommandPaletteStore.getState().open).toBe(true)
    useCommandPaletteStore.getState().closePalette()
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })

  it('toggle flips the flag', () => {
    useCommandPaletteStore.getState().toggle()
    expect(useCommandPaletteStore.getState().open).toBe(true)
    useCommandPaletteStore.getState().toggle()
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })
})
