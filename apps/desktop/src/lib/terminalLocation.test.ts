import { describe, expect, it } from 'vitest'
import type { GitWorktree } from '@git-manager/git-types'
import { directoryName, terminalLocationLabel } from './terminalLocation'

const worktree = (path: string, branch: string, isMain = false): GitWorktree =>
  ({ path, branch, isMain, commitOid: 'abc123', isLocked: false, isPrunable: false }) as GitWorktree

describe('directoryName', () => {
  it('returns the last segment of a path', () => {
    expect(directoryName('/Users/me/code/repo')).toBe('repo')
  })

  it('ignores a trailing slash', () => {
    expect(directoryName('/Users/me/code/repo/')).toBe('repo')
  })

  it('falls back to the path itself when there is no segment', () => {
    expect(directoryName('/')).toBe('/')
  })
})

describe('terminalLocationLabel', () => {
  const worktrees = [
    worktree('/repo', 'main', true),
    worktree('/repo/.worktrees/feature', 'feat/login'),
  ]

  it('names the branch checked out in that worktree', () => {
    expect(terminalLocationLabel('/repo', worktrees)).toBe('main')
    expect(terminalLocationLabel('/repo/.worktrees/feature', worktrees)).toBe('feat/login')
  })

  it('falls back to the folder name for a path that is not one of the repo worktrees', () => {
    expect(terminalLocationLabel('/elsewhere/other-repo', worktrees)).toBe('other-repo')
  })

  it('falls back to the folder name on a detached HEAD, which names nothing actionable', () => {
    expect(
      terminalLocationLabel('/repo/.worktrees/old', [
        worktree('/repo/.worktrees/old', '(detached HEAD)'),
      ])
    ).toBe('old')
  })

  it('falls back to the folder name when the worktree list has not loaded yet', () => {
    expect(terminalLocationLabel('/repo/.worktrees/feature', [])).toBe('feature')
  })
})
