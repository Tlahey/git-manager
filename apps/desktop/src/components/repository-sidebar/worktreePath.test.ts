import { describe, it, expect } from 'vitest'
import { defaultWorktreePath, worktreePathInParent } from './worktreePath'

describe('defaultWorktreePath', () => {
  it('builds a sibling <project>.worktrees/<branch> directory', () => {
    expect(defaultWorktreePath('/Users/x/myproject', 'feature-login')).toBe(
      '/Users/x/myproject.worktrees/feature-login'
    )
  })

  it('preserves slashes in the branch name so nested branches nest on disk', () => {
    expect(defaultWorktreePath('/Users/x/git-manager', 'claude/graph-styling')).toBe(
      '/Users/x/git-manager.worktrees/claude/graph-styling'
    )
  })

  it('ignores a trailing slash on the repo root', () => {
    expect(defaultWorktreePath('/Users/x/myproject/', 'main')).toBe(
      '/Users/x/myproject.worktrees/main'
    )
  })
})

describe('worktreePathInParent', () => {
  it('appends the branch name to a picked parent directory, slashes preserved', () => {
    expect(worktreePathInParent('/tmp/wts', 'claude/foo')).toBe('/tmp/wts/claude/foo')
  })

  it('ignores a trailing slash on the parent directory', () => {
    expect(worktreePathInParent('/tmp/wts/', 'main')).toBe('/tmp/wts/main')
  })
})
