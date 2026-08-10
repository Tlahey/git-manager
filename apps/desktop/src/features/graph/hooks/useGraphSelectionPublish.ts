import { useEffect, useMemo } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import { isSyntheticRow } from '../lib/syntheticRows'

interface UseGraphSelectionPublishParams {
  /** The row the graph considers primary — may be a synthetic `WIP` / `CONFLICT` row. */
  primaryOid: string | null
  /** The loaded page, read only to resolve a stash row's index. */
  nodes: GitGraphNode[]
  /** Real commits currently multi-selected, newest first. Empty below two selected rows. */
  selectedCommitNodes: GitGraphNode[]
}

/**
 * Mirrors the graph's selection into the shared store, so out-of-tree UI — the command palette,
 * chiefly — can act on what is selected without reaching into the graph.
 *
 * Three values travel: the primary commit, its stash index when the row is a stash, and the whole
 * multi-selection. All three are cleared on unmount, so a closed tab leaves no stale selection
 * behind.
 *
 * **The stash index must stay a memoized primitive**, and that is not a micro-optimisation. Reading
 * it inside the effect would put the raw `nodes` array in the effect's dependencies; `nodes` is
 * react-query's `data` defaulted to `[]`, so it is a fresh reference on every render while the
 * query has no data yet. The effect then re-ran — and re-published — on every single render. Several
 * consumers (`TabBar`, `NewTabMenu`, `UserProfile`) subscribe to the whole `repoUI` store with no
 * selector, so *any* publish re-renders them even when the value did not change; that compounded
 * into a "Maximum update depth exceeded" loop. Deriving a primitive here means the effect only fires
 * when the stash index actually changes.
 */
export function useGraphSelectionPublish({
  primaryOid,
  nodes,
  selectedCommitNodes,
}: UseGraphSelectionPublishParams) {
  const setSelectedCommitOid = useRepoUIStore((s) => s.setSelectedCommitOid)
  const setSelectedCommitOids = useRepoUIStore((s) => s.setSelectedCommitOids)
  const setSelectedStashIndex = useRepoUIStore((s) => s.setSelectedStashIndex)

  // Same stash detection as `useGraphRowMenus.ts`'s native stash-menu path.
  const derivedStashIndex = useMemo(() => {
    if (!primaryOid || isSyntheticRow(primaryOid)) return null
    const stashRef = nodes
      .find((n) => n.commit.oid === primaryOid)
      ?.refs.find((r) => r.type === 'stash')
    const stashMatch = stashRef?.shortName.match(/stash@\{(\d+)\}/)
    return stashMatch ? parseInt(stashMatch[1], 10) : null
  }, [primaryOid, nodes])

  // The synthetic WIP/CONFLICT rows aren't valid commit-action targets → publish null.
  useEffect(() => {
    const isRealCommit = !!primaryOid && !isSyntheticRow(primaryOid)
    setSelectedCommitOid(isRealCommit ? primaryOid : null)
    setSelectedStashIndex(derivedStashIndex)
  }, [primaryOid, derivedStashIndex, setSelectedCommitOid, setSelectedStashIndex])

  useEffect(
    () => () => {
      setSelectedCommitOid(null)
      setSelectedStashIndex(null)
    },
    [setSelectedCommitOid, setSelectedStashIndex]
  )

  // The multi-selection's oids, newest first — the single mirror above only names the primary row,
  // and "create patch from selection" acts on the whole group.
  useEffect(() => {
    setSelectedCommitOids(selectedCommitNodes.map((n) => n.commit.oid))
  }, [selectedCommitNodes, setSelectedCommitOids])

  useEffect(() => () => setSelectedCommitOids([]), [setSelectedCommitOids])
}
