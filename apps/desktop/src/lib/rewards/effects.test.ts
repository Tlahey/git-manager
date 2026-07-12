import { describe, it, expect } from 'vitest'
import { findEffectGate, isEffectUnlocked, getUnlockedEffects } from './effects'
import type { Achievement } from './types'

function achievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'a1',
    title: 't',
    description: 'd',
    points: 10,
    type: 'bronze',
    difficulty: 'beginner',
    rewardDescription: 'r',
    kind: 'action',
    unlocked: false,
    ...overrides,
  }
}

describe('findEffectGate', () => {
  it('finds the achievement gating a given effect type/id', () => {
    const gated = achievement({
      id: 'theme-unlocker',
      effects: [{ type: 'theme', id: 'dark-forest' }],
    })
    const other = achievement({ id: 'other' })
    expect(findEffectGate([other, gated], 'theme', 'dark-forest')).toBe(gated)
  })

  it('returns null when no achievement declares the effect', () => {
    const a = achievement({ effects: [{ type: 'theme', id: 'dark-forest' }] })
    expect(findEffectGate([a], 'theme', 'unrelated-id')).toBeNull()
  })

  it('returns null when achievements have no effects at all', () => {
    expect(findEffectGate([achievement()], 'avatarFrame', 'gold-frame')).toBeNull()
  })
})

describe('isEffectUnlocked', () => {
  it('is unlocked when not gated by any achievement', () => {
    expect(isEffectUnlocked([achievement()], 'theme', 'free-theme')).toBe(true)
  })

  it('reflects the gating achievement unlock state when locked', () => {
    const gate = achievement({ unlocked: false, effects: [{ type: 'theme', id: 'dark-forest' }] })
    expect(isEffectUnlocked([gate], 'theme', 'dark-forest')).toBe(false)
  })

  it('reflects the gating achievement unlock state when unlocked', () => {
    const gate = achievement({ unlocked: true, effects: [{ type: 'theme', id: 'dark-forest' }] })
    expect(isEffectUnlocked([gate], 'theme', 'dark-forest')).toBe(true)
  })
})

describe('getUnlockedEffects', () => {
  it('collects only effect ids from unlocked achievements', () => {
    const unlocked = achievement({
      id: 'u',
      unlocked: true,
      effects: [
        { type: 'theme', id: 'dark-forest' },
        { type: 'avatarFrame', id: 'gold-frame' },
      ],
    })
    const locked = achievement({
      id: 'l',
      unlocked: false,
      effects: [{ type: 'theme', id: 'locked-theme' }],
    })
    const result = getUnlockedEffects([unlocked, locked], 'theme')
    expect(result).toEqual(new Set(['dark-forest']))
  })

  it('ignores unlocked achievements with no effects', () => {
    const unlocked = achievement({ unlocked: true })
    expect(getUnlockedEffects([unlocked], 'theme')).toEqual(new Set())
  })

  it('returns an empty set when nothing matches the requested type', () => {
    const unlocked = achievement({
      unlocked: true,
      effects: [{ type: 'avatarFrame', id: 'gold-frame' }],
    })
    expect(getUnlockedEffects([unlocked], 'theme')).toEqual(new Set())
  })
})
