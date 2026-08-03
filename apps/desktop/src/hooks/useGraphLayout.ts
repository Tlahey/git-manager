import { useMemo, type RefObject } from 'react'
import type { GitGraphNode } from '@git-manager/git-types'
import { useRefDragStore } from '../stores/refDrag.store'
import {
  COLUMN_DEFS,
  COLUMN_ORDER,
  type ColumnKey,
  type ResolvedColumn,
} from '../components/git-graph/columns.config'
import { getGraphColumnLayout, getGraphMaxWidth } from '../components/git-graph/graphColumnSizing'
import { computeLaneBranchByOid, collectRefDropHighlight } from '../components/git-graph/laneBranch'
import { useGraphColumnScroll } from './useGraphColumnScroll'

export interface GraphOverflowZone {
  left: number
  width: number
  opacity: number
}

/**
 * Pure geometry/derived-state for the commit graph's column layout: the graph column's lane count
 * and resolved widths, its horizontal scroll and overflow zone, the branch-lane hint map, and the
 * O(1) lookup sets row rendering uses for search/author-filter dimming and drag-hover highlighting.
 *
 * Extracted from GitGraph.tsx (2026-08 retrofit, see architecture-guardian skill's R3) as the
 * purest of its concerns — every value here is a `useMemo` with no side effects — so it's also the
 * safest one to have moved and the easiest to unit-test in isolation.
 */
export function useGraphLayout({
  nodes,
  renderNodes,
  columnState,
  rowHeight,
  matchingOids,
  authorMatchingOids,
  parentRef,
}: {
  nodes: GitGraphNode[]
  renderNodes: GitGraphNode[]
  columnState: Record<ColumnKey, { visible: boolean; width: number }>
  rowHeight: number
  matchingOids: string[] | null
  authorMatchingOids: string[] | null
  parentRef: RefObject<HTMLDivElement | null>
}) {
  // For a commit that carries no ref badge of its own, we still hint — faintly, on hover — which
  // branch's lane it sits on. Ownership is derived by walking first-parent chains from branch tips
  // (see computeLaneBranchByOid); lane colour can't be used because the backend palette recycles.
  const laneRefByOid = useMemo(() => computeLaneBranchByOid(nodes), [nodes])

  // Largest lane occupied by the graph (nodes + connection lines): determines the width beyond
  // which widening the graph column brings nothing, and the display mode (full / overflow /
  // compact) shared by every row.
  const graphMaxColumn = useMemo(() => {
    let max = 0
    for (const n of renderNodes) {
      if (n.column > max) max = n.column
      for (const c of n.connections) {
        if (c.fromColumn > max) max = c.fromColumn
        if (c.toColumn > max) max = c.toColumn
      }
    }
    return max
  }, [renderNodes])

  const avatarSize = rowHeight === 32 ? 24 : 32

  const visibleColumns: ResolvedColumn[] = useMemo(() => {
    // The graph column never exceeds the graph's actually useful width, even if a wider value
    // was persisted (the flex `message` column absorbs the difference).
    const graphMaxWidth = Math.max(
      getGraphMaxWidth(graphMaxColumn, avatarSize),
      COLUMN_DEFS.graph.minWidth
    )
    return COLUMN_ORDER.filter((k) => columnState[k].visible).map((k) =>
      k === 'graph'
        ? {
            ...COLUMN_DEFS[k],
            width: Math.min(columnState[k].width, graphMaxWidth),
            maxWidth: graphMaxWidth,
          }
        : { ...COLUMN_DEFS[k], width: columnState[k].width }
    )
  }, [columnState, graphMaxColumn, avatarSize])

  // Where the graph column sits in a row — its x-offset is the width of everything to its left,
  // i.e. the refs column's width when visible and 0 when hidden. Same convention as GraphRow
  // (band/markers) to stay pixel-aligned. A hidden graph column reports a width of 0.
  const { refsWidth, graphWidth } = useMemo(() => {
    const graphCol = visibleColumns.find((c) => c.key === 'graph')
    const refsCol = visibleColumns.find((c) => c.key === 'refs')
    return { refsWidth: refsCol ? refsCol.width : 0, graphWidth: graphCol ? graphCol.width : 0 }
  }, [visibleColumns])

  // Footprint of the graph column inside the list (its `mx-2` margins included) and how far its
  // lanes can be panned sideways — the two things the wheel gesture is bounded by.
  const graphColumnBounds = useMemo(
    () => ({
      left: refsWidth,
      width: graphWidth === 0 ? 0 : graphWidth + 16,
      maxScrollX:
        graphWidth === 0
          ? 0
          : getGraphColumnLayout(graphWidth, graphMaxColumn, avatarSize).maxScrollX,
    }),
    [refsWidth, graphWidth, graphMaxColumn, avatarSize]
  )

  const graphScrollX = useGraphColumnScroll(parentRef, graphColumnBounds)

  // Graph column overflow zone: a single continuous overlay spanning the whole list height (one
  // segment per row left a one-pixel shadowless seam between rows). Its left counterpart renders
  // nothing — no shadow — so the pinning/clipping geometry alone stands for it.
  const graphOverflowZone: GraphOverflowZone | null = useMemo(() => {
    if (graphWidth === 0) return null
    const layout = getGraphColumnLayout(graphWidth, graphMaxColumn, avatarSize, graphScrollX)
    if (layout.overlayOpacity <= 0) return null
    return {
      left: refsWidth + 8 + layout.overlayStart,
      // The zone grows with the width deficit (overlayStart recedes progressively) and stops
      // 3px before the column's edge to keep the colored border-right visible.
      width: Math.max(0, layout.innerWidth - layout.overlayStart - 3),
      // Shadow fade while the zone grows and over the compact range.
      opacity: layout.overlayOpacity,
    }
  }, [refsWidth, graphWidth, graphMaxColumn, avatarSize, graphScrollX])

  // Set for O(1) row-level "does this commit match the active search" lookups (see `dimmed` in
  // GraphRow) — `null` mirrors `matchingOids`'s "no active search" meaning (nothing dimmed).
  const matchSet = useMemo(() => (matchingOids ? new Set(matchingOids) : null), [matchingOids])
  const totalMatches = matchingOids?.length ?? 0

  // Same O(1) lookup set for the AUTHOR column filter — `null` when no author is selected.
  const authorMatchSet = useMemo(
    () => (authorMatchingOids ? new Set(authorMatchingOids) : null),
    [authorMatchingOids]
  )

  // While a ref badge is drag-hovered as a drop target, highlight that ref's *own* lane commits
  // (first-parent attribution — not the shared ancestors below the fork, nor any children) and dim
  // the rest, the same muting the search uses. The sticky hover ref lives in the drag store.
  const dragHoverRef = useRefDragStore((s) => s.hoverRef)
  const dragHighlightSet = useMemo(
    () => collectRefDropHighlight(dragHoverRef, laneRefByOid),
    [dragHoverRef, laneRefByOid]
  )

  return {
    laneRefByOid,
    graphMaxColumn,
    avatarSize,
    visibleColumns,
    refsWidth,
    graphWidth,
    graphColumnBounds,
    graphScrollX,
    graphOverflowZone,
    matchSet,
    totalMatches,
    authorMatchSet,
    dragHighlightSet,
  }
}

export type UseGraphLayoutResult = ReturnType<typeof useGraphLayout>
