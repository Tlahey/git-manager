import type { GitGraphNode } from '@git-manager/git-types'

/**
 * How many commits descend from `oid` on the current branch — the count the "recompose children"
 * menu entry names, and the number of commits that would be *rewritten* beyond the clicked one.
 *
 * Walks parents down from the branch tip rather than children up from the commit, because the graph
 * nodes only carry `parentOids`. First-parent only: that is the branch's own line, and it is exactly
 * the set an interactive rebase from this commit would replay.
 *
 * Returns 0 when the commit is the tip, is not on the branch's first-parent line, or when the tip is
 * outside the loaded page — all cases where offering to rewrite "N children" would be a guess.
 */
export function descendantsOnCurrentBranch(
  nodes: GitGraphNode[],
  oid: string,
  branchTipOid: string | undefined
): number {
  if (!branchTipOid || branchTipOid === oid) return 0

  const byOid = new Map(nodes.map((n) => [n.commit.oid, n]))
  let cursor = byOid.get(branchTipOid)
  let count = 0

  while (cursor && cursor.commit.oid !== oid) {
    count += 1
    const firstParent = cursor.commit.parentOids[0]
    cursor = firstParent ? byOid.get(firstParent) : undefined
  }

  // Ran off the loaded page without meeting the commit: it is not on this line, as far as we know.
  return cursor ? count : 0
}
