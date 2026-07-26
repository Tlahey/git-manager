import { describe, expect, it } from 'vitest'
import type { GitBranch } from '@git-manager/git-types'
import { resolveExplanationBase } from './branchExplanationBase'

const existing = ['main', 'origin/main', 'develop', 'origin/develop', 'feat/login']

/** A `GitBranch` as `get_branches` really returns it: `name` keeps the remote prefix, `shortName`
 * has it stripped. Mixing the two up is what broke this resolver in the first place. */
function branch(name: string, isRemote = name.includes('/') && name.startsWith('origin/')): GitBranch {
  return {
    name,
    shortName: isRemote ? name.split('/').slice(1).join('/') : name,
    isHead: false,
    isRemote,
    commitOid: 'oid',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

describe('resolveExplanationBase', () => {
  it('prefers the repo configured merge target, most specific first', () => {
    expect(resolveExplanationBase('feat/login', ['origin/develop', 'origin/main'], existing)).toBe(
      'origin/develop'
    )
  })

  it('skips a configured target the clone does not have', () => {
    expect(resolveExplanationBase('feat/login', ['origin/nope', 'origin/main'], existing)).toBe(
      'origin/main'
    )
  })

  it('falls back to the conventional refs when nothing is configured', () => {
    expect(resolveExplanationBase('feat/login', [], existing)).toBe('origin/main')
    expect(resolveExplanationBase('feat/login', [], ['master', 'feat/login'])).toBe('master')
  })

  it('never returns the branch itself', () => {
    expect(resolveExplanationBase('origin/main', [], existing)).toBe('main')
  })

  it('still compares a local branch against its remote counterpart', () => {
    // `main` vs `origin/main` is the branch's own unpushed work — worth explaining, not a no-op.
    expect(resolveExplanationBase('main', ['origin/main'], existing)).toBe('origin/main')
  })

  it('returns null when the clone has no usable base', () => {
    expect(resolveExplanationBase('feat/login', ['origin/main'], ['feat/login'])).toBeNull()
  })
})

// Regression: the callers pass `GitBranch.name`, and for a remote branch that is the only field
// carrying the `origin/` prefix. Feeding `shortName` instead made `origin/main` unmatchable, so
// right-clicking `main` reported "no base branch found" on a perfectly ordinary repo.
describe('resolveExplanationBase — with real GitBranch shapes', () => {
  const clone = [branch('main'), branch('origin/main'), branch('feat/login')]
  const names = clone.map((b) => b.name)

  it('resolves main against its remote counterpart', () => {
    expect(resolveExplanationBase('main', ['origin/main', 'origin/master'], names)).toBe(
      'origin/main'
    )
  })

  it('resolves a feature branch against the configured remote target', () => {
    expect(resolveExplanationBase('feat/login', ['origin/main', 'origin/master'], names)).toBe(
      'origin/main'
    )
  })

  it('would find nothing if given shortName — the bug this guards', () => {
    const shortNames = clone.map((b) => b.shortName)
    expect(resolveExplanationBase('main', ['origin/main', 'origin/master'], shortNames)).toBeNull()
  })

  it('still resolves on a clone with no remote at all', () => {
    const local = [branch('main'), branch('feat/login')].map((b) => b.name)
    expect(resolveExplanationBase('feat/login', ['origin/main'], local)).toBe('main')
  })
})
