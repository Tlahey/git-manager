import { describe, it, expect } from 'vitest'
import type { GitBranch } from '@git-manager/git-types'
import { buildBranchTree, type BranchTreeNode } from './branchTree'

/** Shaped like the backend reports it: `name` carries the remote, `shortName` does not. */
function branch(qualifiedName: string): GitBranch {
  return {
    name: qualifiedName,
    shortName: qualifiedName.split('/').slice(1).join('/'),
    isHead: false,
    isRemote: true,
    commitOid: 'abc1234',
    commitMessage: 'chore: something',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  }
}

/** `shortName` already reads relative to the remote — that is the name folders are cut from. */
const tree = (names: string[]) => buildBranchTree(names.map(branch), (b) => b.shortName)

/** Compact shape of a tree: `folder > [children]` / plain branch display names. */
function shape(nodes: BranchTreeNode[]): unknown[] {
  return nodes.map((n) => (n.kind === 'branch' ? n.displayName : { [n.name]: shape(n.children) }))
}

describe('buildBranchTree', () => {
  it('leaves a branch with no folder in its name at the top level', () => {
    expect(shape(tree(['origin/main', 'origin/dev']))).toEqual(['dev', 'main'])
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
      { build: [{ ci: ['lint'] }, 'release'] },
    ])
  })

  // One list, ordered by what each row shows: a folder does not sort ahead of a branch.
  it('interleaves folders and branches alphabetically', () => {
    expect(shape(tree(['origin/zeta', 'origin/build/b', 'origin/main', 'origin/alpha/a']))).toEqual(
      [{ alpha: ['a'] }, { build: ['b'] }, 'main', 'zeta']
    )
  })

  it('orders every level, not just the top one', () => {
    expect(
      shape(tree(['origin/build/zeta', 'origin/build/ci/lint', 'origin/build/alpha']))
    ).toEqual([{ build: ['alpha', { ci: ['lint'] }, 'zeta'] }])
  })

  // A closed folder has to take everything below it off screen, so it owns the deep branches too.
  it('carries every branch below a folder, at any depth, on that folder', () => {
    const [buildFolder] = tree(['origin/build/ci/lint', 'origin/build/release'])
    expect(buildFolder).toMatchObject({
      kind: 'folder',
      name: 'build',
      branches: [{ name: 'origin/build/ci/lint' }, { name: 'origin/build/release' }],
    })
  })

  it('keeps the full branch on the leaf, so a row can still check it out', () => {
    const [folder] = tree(['origin/build/xxxx'])
    const leaf = folder.kind === 'folder' ? folder.children[0] : folder
    expect(leaf).toMatchObject({
      kind: 'branch',
      displayName: 'xxxx',
      branch: { name: 'origin/build/xxxx', shortName: 'build/xxxx' },
    })
  })

  it('returns nothing for a remote with no branches', () => {
    expect(tree([])).toEqual([])
  })
})
