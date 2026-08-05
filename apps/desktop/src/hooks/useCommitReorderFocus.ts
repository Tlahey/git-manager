import { useEffect } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'
import {
  collectReorderableOids,
  findHeadOid,
  isStaleWindow,
  locateMovedCommits,
  type CommitReorderOperation,
} from '../components/git-graph/commitReorder'

/**
 * Puts the graph's selection back on the commits a drag just moved, once the rewritten history has
 * loaded — instead of leaving it on the row they were dragged from.
 *
 * The commits come back from the rebase with new OIDs, so the selection cannot simply survive: it
 * is re-derived by position (see `locateMovedCommits`) against the reloaded first-parent line. The
 * work has to happen here rather than in `useCommitReorderDrag` because it can only run *after*
 * the invalidated `git-log` query has resettled, which is a render away from the call that
 * triggered it.
 *
 * The effect is a no-op until then: `isStaleWindow` tells the pre-rebase graph from the new one, so
 * an early run can't map the positions onto the old history and select the wrong commits — which
 * is precisely the failure this whole mechanism exists to avoid.
 */
export function useCommitReorderFocus({
  landed,
  clearLanded,
  nodes,
  filteredNodes,
  headBranchName,
  setSelected,
  setPrimaryOid,
  scrollToIndex,
}: {
  /** The operation that just landed, or `null` when there is nothing to re-focus. */
  landed: CommitReorderOperation | null
  clearLanded: () => void
  /** The graph's full walk — what the first-parent window is derived from. */
  nodes: GitGraphNode[]
  /** The rows actually on screen — what an index passed to `scrollToIndex` addresses. */
  filteredNodes: GitGraphNode[]
  headBranchName: string | null
  setSelected: (oids: Set<string>) => void
  setPrimaryOid: (oid: string | null) => void
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' }) => void
}) {
  useEffect(() => {
    if (!landed) return
    const newWindow = collectReorderableOids(nodes, findHeadOid(nodes, headBranchName))
    if (isStaleWindow(landed, newWindow)) return

    const movedOids = locateMovedCommits(landed, newWindow)
    // Nothing resolvable: the history came back in a shape the plan doesn't explain (an abort, a
    // concurrent write). Drop the request rather than retry against every later render.
    if (movedOids.length === 0) {
      clearLanded()
      return
    }

    setSelected(new Set(movedOids))
    setPrimaryOid(movedOids[0])
    // Scroll to the newest of the group: with the details panel keyed on the primary row, that is
    // the one the user is about to read.
    const index = filteredNodes.findIndex((n) => n.commit.oid === movedOids[0])
    if (index !== -1) scrollToIndex(index, { align: 'center' })
    clearLanded()
  }, [
    landed,
    clearLanded,
    nodes,
    filteredNodes,
    headBranchName,
    setSelected,
    setPrimaryOid,
    scrollToIndex,
  ])
}
