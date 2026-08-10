import { describe, it, expect, beforeEach } from 'vitest'
import { useCommandPaletteStore } from './commandPalette.store'

beforeEach(() => {
  useCommandPaletteStore.setState({ open: false, mode: 'all', refPicker: null })
})

const STEP = { verb: 'merge', label: 'Merge a branch into main…' } as const

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

  it('holds the branch verb waiting for its target', () => {
    expect(useCommandPaletteStore.getState().refPicker).toBeNull()
    useCommandPaletteStore.getState().setRefPicker(STEP)
    expect(useCommandPaletteStore.getState().refPicker).toEqual(STEP)
  })

  // A palette reopening halfway through choosing a branch would answer a question the user has
  // already walked away from, so every way in and out clears the step.
  it.each([
    ['closePalette', () => useCommandPaletteStore.getState().closePalette()],
    ['openPalette', () => useCommandPaletteStore.getState().openPalette()],
    ['toggle', () => useCommandPaletteStore.getState().toggle('files')],
  ])('%s clears the picker', (_name, act) => {
    useCommandPaletteStore.setState({ open: true, refPicker: STEP })
    act()
    expect(useCommandPaletteStore.getState().refPicker).toBeNull()
  })
})
