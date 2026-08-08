import { describe, expect, it } from 'vitest'
import type { GitBranch } from '@git-manager/git-types'
import {
  localBranchNameForRemote,
  remoteTrackingBranches,
  resolveDefaultUpstream,
} from './branchUpstream'

/** A `GitBranch` as `get_branches` really returns it: `name` keeps the remote prefix, `shortName`
 * has it stripped. */
function branch(name: string, isRemote: boolean): GitBranch {
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

describe('remoteTrackingBranches', () => {
  it('keeps only the remote entries', () => {
    const branches = [branch('main', false), branch('origin/main', true), branch('feat', false)]
    expect(remoteTrackingBranches(branches).map((b) => b.name)).toEqual(['origin/main'])
  })
})

describe('localBranchNameForRemote', () => {
  it('drops the remote prefix', () => {
    expect(localBranchNameForRemote('origin/main')).toBe('main')
  })

  it('keeps the slashes inside the branch name itself', () => {
    expect(localBranchNameForRemote('upstream/feature/nested/name')).toBe('feature/nested/name')
  })

  it('is empty for a ref with nothing after the remote — never the remote name itself', () => {
    expect(localBranchNameForRemote('origin')).toBe('')
  })
})

describe('resolveDefaultUpstream', () => {
  it('defaults to origin/<name> when it is the only match', () => {
    const branches = [branch('feat', false), branch('origin/feat', true)]
    expect(resolveDefaultUpstream('feat', branches)).toBe('origin/feat')
  })

  it('returns null when there is no remote-tracking branch of the same name', () => {
    const branches = [branch('feat', false), branch('origin/main', true)]
    expect(resolveDefaultUpstream('feat', branches)).toBeNull()
  })

  it('returns null when two remotes both have a same-named branch — ambiguous, let the user pick', () => {
    const branches = [
      branch('feat', false),
      branch('origin/feat', true),
      branch('upstream/feat', true),
    ]
    expect(resolveDefaultUpstream('feat', branches)).toBeNull()
  })

  it('returns null on a repo with no remotes at all', () => {
    expect(resolveDefaultUpstream('feat', [branch('feat', false)])).toBeNull()
  })

  it('matches on the logical name, not a raw string match against the local name', () => {
    // A `upstream/feat` branch should not satisfy `feat` on `origin` alone, and vice versa: only the
    // branch part after the remote prefix is compared.
    const branches = [branch('feat', false), branch('upstream/feat', true)]
    expect(resolveDefaultUpstream('feat', branches)).toBe('upstream/feat')
  })
})
