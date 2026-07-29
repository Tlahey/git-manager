import { describe, it, expect } from 'vitest'
import type { GitBranch } from '@git-manager/git-types'
import { buildRemoteBranchTree, type RemoteTreeNode } from './remoteBranchTree'

function branch(shortName: string): GitBranch {
  return {
    name: `refs/remotes/${shortName}`,
    shortName,
    isHead: false,
    isRemote: true,
    commitOid: 'abc1234',
    commitMessage: 'chore: something',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

/** `origin/build/ci` reads as `build/ci` under the `origin` node. */
const underOrigin = (b: GitBranch) => b.shortName.replace(/^origin\//, '')

const tree = (names: string[]) => buildRemoteBranchTree(names.map(branch), underOrigin)

/** Compact shape of a tree: `folder > [children]` / plain branch display names. */
function shape(nodes: RemoteTreeNode[]): unknown[] {
  return nodes.map((n) =>
    n.kind === 'branch' ? n.displayName : { [n.name]: shape(n.children) }
  )
}

describe('buildRemoteBranchTree', () => {
  it('leaves a branch with no folder in its name at the top level', () => {
    expect(shape(tree(['origin/main', 'origin/dev']))).toEqual(['main', 'dev'])
  })

  // The whole point: a namespace is a folder whether one branch or ten happen to sit in it.
  it('folders a single branch, unlike the local list', () => {
    expect(shape(tree(['origin/build/xxxx']))).toEqual([{ build: ['xxxx'] }])
  })

  it('nests one level per path segment', () => {
    expect(shape(tree(['origin/build/ci/lint']))).toEqual([{ build: [{ ci: ['lint'] }] }])
  })

  it('gathers the branches sharing a folder under that one folder', () => {
    expect(shape(tree(['origin/feat/a', 'origin/feat/b']))).toEqual([{ feat: ['a', 'b'] }])
  })

  it('splits branches whose paths diverge below a shared folder', () => {
    expect(shape(tree(['origin/build/ci/lint', 'origin/build/release']))).toEqual([
      { build: ['release', { ci: ['lint'] }] },
    ])
  })

  it('lists loose branches before folders, folders alphabetically', () => {
    expect(shape(tree(['origin/zeta/a', 'origin/build/b', 'origin/main']))).toEqual([
      'main',
      { build: ['b'] },
      { zeta: ['a'] },
    ])
  })

  // A closed folder has to take everything below it off screen, so it owns the deep branches too.
  it('carries every branch below a folder, at any depth, on that folder', () => {
    const [buildFolder] = tree(['origin/build/ci/lint', 'origin/build/release'])
    expect(buildFolder).toMatchObject({
      kind: 'folder',
      name: 'build',
      branchNames: ['origin/build/ci/lint', 'origin/build/release'],
    })
  })

  it('keeps the full branch on the leaf, so a row can still check it out', () => {
    const [folder] = tree(['origin/build/xxxx'])
    const leaf = folder.kind === 'folder' ? folder.children[0] : folder
    expect(leaf).toMatchObject({
      kind: 'branch',
      displayName: 'xxxx',
      branch: { name: 'refs/remotes/origin/build/xxxx', shortName: 'origin/build/xxxx' },
    })
  })

  it('returns nothing for a remote with no branches', () => {
    expect(tree([])).toEqual([])
  })
})
