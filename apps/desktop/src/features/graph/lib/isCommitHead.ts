import type { GitGraphNode } from '@git-manager/git-types'
import { isSyntheticRow } from './syntheticRows'

/**
 * Whether `node` is the commit HEAD currently points at.
 *
 * Three strategies, tried in turn, because none of them holds on its own:
 *
 * 1. a ref of type `HEAD` sits directly on the commit — the detached case, and the only one that
 *    is unambiguous;
 * 2. the commit carries the branch HEAD points to — the ordinary case, but it needs a branch name,
 *    which a detached HEAD does not have;
 * 3. it is the first node of the walk — a fallback, true in practice because the log is walked from
 *    HEAD, and the only thing left when the loaded page carries no ref at all.
 *
 * A synthetic row is never HEAD: the WIP and CONFLICT rows stand for uncommitted state, not for a
 * commit, so asking whether HEAD is at one of them has no answer.
 */
export function isCommitHead(
  node: GitGraphNode | null,
  nodes: GitGraphNode[],
  headBranchName: string | null | undefined
): boolean {
  if (!node || isSyntheticRow(node.commit.oid)) return false

  const hasHeadRef = node.refs.some((r) => r.type === 'HEAD')
  const hasBranchRef = headBranchName
    ? node.refs.some(
        (r) => r.type === 'branch' && (r.shortName === headBranchName || r.name === headBranchName)
      )
    : false
  const isFirstNode = node.commit.oid === nodes[0]?.commit?.oid

  return hasHeadRef || hasBranchRef || isFirstNode
}
