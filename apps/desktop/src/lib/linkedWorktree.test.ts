import { describe, it, expect } from 'vitest'
import { isLinkedWorktree } from './linkedWorktree'

describe('isLinkedWorktree', () => {
  it('flags a worktree whose owner is a different path', () => {
    expect(
      isLinkedWorktree({ path: '/repo/.worktrees/feature', mainWorktreePath: '/repo' })
    ).toBe(true)
  })

  it('does not flag a normal repo, whose owner is itself', () => {
    expect(isLinkedWorktree({ path: '/repo', mainWorktreePath: '/repo' })).toBe(false)
  })

  it('does not flag a snapshot that predates mainWorktreePath', () => {
    // Answering "unknown" as false keeps a real repository visible; the opposite would hide it.
    expect(isLinkedWorktree({ path: '/repo' })).toBe(false)
  })
})
