import { describe, it, expect, beforeEach } from 'vitest'
import { useCommandPaletteStore } from './commandPalette.store'

beforeEach(() => {
  useCommandPaletteStore.setState({ open: false, mode: 'all' })
})

describe('commandPalette.store', () => {
  it('starts closed', () => {
    expect(useCommandPaletteStore.getState().open).toBe(false)
    expect(useCommandPaletteStore.getState().mode).toBe('all')
  })

  it('openPalette / closePalette set the flag and mode', () => {
    useCommandPaletteStore.getState().openPalette('files')
    expect(useCommandPaletteStore.getState().open).toBe(true)
    expect(useCommandPaletteStore.getState().mode).toBe('files')
    useCommandPaletteStore.getState().closePalette()
    expect(useCommandPaletteStore.getState().open).toBe(false)
    expect(useCommandPaletteStore.getState().mode).toBe('all')
  })

  it('toggle flips the flag and handles modes', () => {
    useCommandPaletteStore.getState().toggle('files')
    expect(useCommandPaletteStore.getState().open).toBe(true)
    expect(useCommandPaletteStore.getState().mode).toBe('files')
    useCommandPaletteStore.getState().toggle('files')
    expect(useCommandPaletteStore.getState().open).toBe(false)
  })
})
