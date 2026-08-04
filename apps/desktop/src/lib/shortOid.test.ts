import { describe, it, expect } from 'vitest'
import { shortOid } from './shortOid'

describe('shortOid', () => {
  it('truncates a full 40-character SHA-1 to 7 characters', () => {
    expect(shortOid('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678')).toBe('a1b2c3d')
  })

  it('returns an already-short string unchanged', () => {
    expect(shortOid('a1b2c3d')).toBe('a1b2c3d')
    expect(shortOid('abc')).toBe('abc')
  })

  it('returns an empty string unchanged', () => {
    expect(shortOid('')).toBe('')
  })
})
