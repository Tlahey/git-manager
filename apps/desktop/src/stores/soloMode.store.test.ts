import { beforeEach, describe, expect, it } from 'vitest'
import { useSoloModeStore } from './soloMode.store'

const reset = () => useSoloModeStore.setState({ active: false, soloed: new Set() })

describe('useSoloModeStore', () => {
  beforeEach(reset)

  it('starts inactive with an empty soloed set', () => {
    const s = useSoloModeStore.getState()
    expect(s.active).toBe(false)
    expect(s.soloed.size).toBe(0)
  })

  it('enable() activates and seeds the soloed set, dropping blanks and dupes', () => {
    useSoloModeStore.getState().enable(['main', '', null, undefined, 'main', 'feat'])
    const s = useSoloModeStore.getState()
    expect(s.active).toBe(true)
    expect([...s.soloed].sort()).toEqual(['feat', 'main'])
  })

  it('enable() with no seed activates with an empty set', () => {
    useSoloModeStore.getState().enable()
    const s = useSoloModeStore.getState()
    expect(s.active).toBe(true)
    expect(s.soloed.size).toBe(0)
  })

  it('toggle() adds an absent branch and removes a present one', () => {
    const { toggle } = useSoloModeStore.getState()
    toggle('feat')
    expect(useSoloModeStore.getState().soloed.has('feat')).toBe(true)
    toggle('feat')
    expect(useSoloModeStore.getState().soloed.has('feat')).toBe(false)
  })

  it('toggle() produces a new Set instance (so subscribers re-render)', () => {
    const before = useSoloModeStore.getState().soloed
    useSoloModeStore.getState().toggle('feat')
    expect(useSoloModeStore.getState().soloed).not.toBe(before)
  })

  it('disable() turns off but keeps the soloed set', () => {
    useSoloModeStore.getState().enable(['main'])
    useSoloModeStore.getState().disable()
    const s = useSoloModeStore.getState()
    expect(s.active).toBe(false)
    expect(s.soloed.has('main')).toBe(true)
  })

  it('clear() turns off and empties the soloed set', () => {
    useSoloModeStore.getState().enable(['main', 'feat'])
    useSoloModeStore.getState().clear()
    const s = useSoloModeStore.getState()
    expect(s.active).toBe(false)
    expect(s.soloed.size).toBe(0)
  })
})
