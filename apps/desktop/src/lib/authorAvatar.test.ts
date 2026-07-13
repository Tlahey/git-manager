import { describe, it, expect } from 'vitest'
import { getAuthorInitials, getAuthorAvatarStyle } from './authorAvatar'

describe('getAuthorInitials', () => {
  it('uses first + last initials for a multi-word name', () => {
    expect(getAuthorInitials('Ada Lovelace')).toBe('AL')
  })

  it('uses the first two characters for a single-word name', () => {
    expect(getAuthorInitials('cheddar')).toBe('CH')
  })

  it('trims surrounding whitespace', () => {
    expect(getAuthorInitials('  grace hopper  ')).toBe('GH')
  })
})

describe('getAuthorAvatarStyle', () => {
  it('is deterministic for the same name', () => {
    expect(getAuthorAvatarStyle('Ada')).toBe(getAuthorAvatarStyle('Ada'))
  })

  it('returns a gradient class string', () => {
    expect(getAuthorAvatarStyle('Ada')).toMatch(/^from-/)
  })
})
