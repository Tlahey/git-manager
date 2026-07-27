import { describe, it, expect } from 'vitest'
import type { GitGraphNode } from '@git-manager/git-types'
import { descendantsOnCurrentBranch } from './useGitGraphActions'

/** A graph node carrying only what the descendant walk reads. */
function node(oid: string, parents: string[] = []): GitGraphNode {
  return { commit: { oid, parentOids: parents }, refs: [] } as unknown as GitGraphNode
}

/** A linear history, newest first — the order the graph itself uses. */
const linear = [node('d', ['c']), node('c', ['b']), node('b', ['a']), node('a', [])]

describe('descendantsOnCurrentBranch', () => {
  it('counts the commits between the target and the branch tip', () => {
    expect(descendantsOnCurrentBranch(linear, 'a', 'd')).toBe(3)
    expect(descendantsOnCurrentBranch(linear, 'b', 'd')).toBe(2)
    expect(descendantsOnCurrentBranch(linear, 'c', 'd')).toBe(1)
  })

  it('reports none for the tip itself', () => {
    // The "rewrite N descendants" entry is hidden here rather than offering to rewrite nothing.
    expect(descendantsOnCurrentBranch(linear, 'd', 'd')).toBe(0)
  })

  it('reports none when the tip is unknown', () => {
    // Detached HEAD, or a tip outside the loaded page — a count would be a guess.
    expect(descendantsOnCurrentBranch(linear, 'a', undefined)).toBe(0)
  })

  it('reports none for a commit that is not on the branch line', () => {
    const sideBranch = [...linear, node('x', ['a'])]
    expect(descendantsOnCurrentBranch(sideBranch, 'x', 'd')).toBe(0)
  })

  it('follows the first parent only, so a merge does not pull in the side branch', () => {
    // The set an interactive rebase from the target would replay is the first-parent line.
    const merged = [
      node('m', ['d', 'side']),
      node('d', ['c']),
      node('side', ['c']),
      node('c', []),
    ]
    expect(descendantsOnCurrentBranch(merged, 'c', 'm')).toBe(2)
    expect(descendantsOnCurrentBranch(merged, 'side', 'm')).toBe(0)
  })

  it('stops rather than looping when the history runs off the loaded page', () => {
    const partial = [node('d', ['c']), node('c', ['missing'])]
    expect(descendantsOnCurrentBranch(partial, 'a', 'd')).toBe(0)
  })
})
