import { describe, it, expect } from 'vitest'
import { isWipRow, isSyntheticRow, worktreeWipPath } from './syntheticRows'

describe('isWipRow', () => {
  it('matches the main working-tree row and every linked worktree one', () => {
    expect(isWipRow('WIP')).toBe(true)
    expect(isWipRow('WIP:/some/path')).toBe(true)
  })

  it('does not match the conflict row or a real commit', () => {
    expect(isWipRow('CONFLICT')).toBe(false)
    expect(isWipRow('abc123')).toBe(false)
  })

  it('does not match a real oid that merely starts with the same letters', () => {
    // A hex oid can't spell "WIP", but the guard is a prefix test, so pin the boundary anyway.
    expect(isWipRow('WIPE')).toBe(false)
    expect(isWipRow('wip')).toBe(false)
  })
})

describe('isSyntheticRow', () => {
  it('covers every non-commit row the graph can show', () => {
    expect(isSyntheticRow('WIP')).toBe(true)
    expect(isSyntheticRow('WIP:/some/path')).toBe(true)
    expect(isSyntheticRow('CONFLICT')).toBe(true)
  })

  it('lets a real commit oid through', () => {
    expect(isSyntheticRow('abc1234567890')).toBe(false)
    expect(isSyntheticRow('')).toBe(false)
  })
})

describe('worktreeWipPath', () => {
  it('returns the worktree path a WIP:<path> row stands for', () => {
    expect(worktreeWipPath('WIP:/repos/feature')).toBe('/repos/feature')
  })

  it('returns null for the main WIP row, which is the repo itself, not a linked worktree', () => {
    expect(worktreeWipPath('WIP')).toBeNull()
  })

  it('returns null for the conflict row and for a real commit', () => {
    expect(worktreeWipPath('CONFLICT')).toBeNull()
    expect(worktreeWipPath('abc1234567890')).toBeNull()
  })
})
