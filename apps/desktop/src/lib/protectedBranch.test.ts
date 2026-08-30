import { describe, expect, it } from 'vitest'
import { isProtectedBranch } from './protectedBranch'

describe('isProtectedBranch', () => {
  const protectedBranches = ['main', 'develop']

  it('returns true when the current branch is protected', () => {
    expect(isProtectedBranch('main', protectedBranches)).toBe(true)
  })

  it('returns false when the current branch is not protected', () => {
    expect(isProtectedBranch('feature/foo', protectedBranches)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isProtectedBranch(null, protectedBranches)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isProtectedBranch(undefined, protectedBranches)).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isProtectedBranch('', protectedBranches)).toBe(false)
  })

  it('returns false when protectedBranches is empty', () => {
    expect(isProtectedBranch('main', [])).toBe(false)
  })
})
