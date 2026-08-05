import { useCallback, useRef, type MutableRefObject } from 'react'
import type { MergeBlock } from '../../types'
import type { BlockPlacement } from '../../mergeBlockLayout'
import { computeMergeVisuals } from '../../mergeDecorations'
import { computeTwoWayVisuals } from '../twoWayView'
import {
  type PaneSide,
  collapsedRegionsForPane,
  toBannerZones,
  toHiddenRanges,
} from '../collapsedRegions'
import { buildLineTopIndex, type LineTopIndex } from '../editorGeometry'

interface UseLineTopGeometryParams {
  blocksRef: MutableRefObject<MergeBlock[]>
  placementsRef: MutableRefObject<Map<number, BlockPlacement>>
  expandedBlocks: Set<number>
  collapseUnchanged: boolean
  isTwoWay: boolean
  showBlockBorders: boolean
  highlightMode: 'words' | 'lines'
}

/** Everything a pane's line-top geometry depends on. Compared by identity (===) — blocks,
 * placements and expandedBlocks are all replaced wholesale rather than mutated, so identity is a
 * sound invalidation signal. */
interface GeometryKey {
  blocks: MergeBlock[]
  placements: Map<number, BlockPlacement>
  expandedBlocks: Set<number>
  collapseUnchanged: boolean
  isTwoWay: boolean
  showBlockBorders: boolean
  vividText: boolean
  lineHeight: number
}

interface GeometryCache {
  key: GeometryKey
  /** Built lazily, one per pane that's actually queried. */
  indexes: Partial<Record<PaneSide, LineTopIndex>>
  /** `side:line` → top, for the (very common) repeated queries within one recompute or scroll tick. */
  tops: Map<string, number>
}

function sameKey(a: GeometryKey, b: GeometryKey): boolean {
  return (
    a.blocks === b.blocks &&
    a.placements === b.placements &&
    a.expandedBlocks === b.expandedBlocks &&
    a.collapseUnchanged === b.collapseUnchanged &&
    a.isTwoWay === b.isTwoWay &&
    a.showBlockBorders === b.showBlockBorders &&
    a.vividText === b.vividText &&
    a.lineHeight === b.lineHeight
  )
}

/** The resolver's collapse/zone-aware line-top geometry, memoized per visual state.
 *
 * Two things make this a hook rather than a plain function, and both are load-bearing on large
 * files:
 *
 * 1. **The inputs are derived once per state, not once per call.** Resolving a line's top needs
 *    the pane's collapsed regions and its alignment view zones — both a full walk over every
 *    block. Computing them inside the callback (as this used to) made a single `getTop` O(blocks),
 *    and `getTop` is itself called O(blocks) times per connector recompute AND per scroll event.
 * 2. **The returned callback is stable.** It reads its inputs through refs and a mutable key, so
 *    it never changes identity — `recomputeConnectors`, `useMergeScrollSync`'s `attach` and the
 *    Monaco listeners registered at mount all depend on it, and a new identity on every collapse
 *    or highlight-mode toggle used to cascade into extra recomputes. */
export function useLineTopGeometry({
  blocksRef,
  placementsRef,
  expandedBlocks,
  collapseUnchanged,
  isTwoWay,
  showBlockBorders,
  highlightMode,
}: UseLineTopGeometryParams) {
  // Mirrors the render-time values so the stable callback below reads the current ones.
  const inputsRef = useRef({
    expandedBlocks,
    collapseUnchanged,
    isTwoWay,
    showBlockBorders,
    highlightMode,
  })
  inputsRef.current = {
    expandedBlocks,
    collapseUnchanged,
    isTwoWay,
    showBlockBorders,
    highlightMode,
  }

  const cacheRef = useRef<GeometryCache | null>(null)

  return useCallback(
    (side: PaneSide, lineNumber: number, lineHeight: number): number => {
      const inputs = inputsRef.current
      const key: GeometryKey = {
        blocks: blocksRef.current,
        placements: placementsRef.current,
        expandedBlocks: inputs.expandedBlocks,
        collapseUnchanged: inputs.collapseUnchanged,
        isTwoWay: inputs.isTwoWay,
        showBlockBorders: inputs.showBlockBorders,
        vividText: inputs.highlightMode === 'lines',
        lineHeight,
      }

      let cache = cacheRef.current
      if (!cache || !sameKey(cache.key, key)) {
        cache = { key, indexes: {}, tops: new Map() }
        cacheRef.current = cache
      }

      const memoKey = `${side}:${lineNumber}`
      const memoized = cache.tops.get(memoKey)
      if (memoized !== undefined) return memoized

      let index = cache.indexes[side]
      if (!index) {
        const collapsedRegions = key.collapseUnchanged
          ? collapsedRegionsForPane(key.blocks, key.placements, key.expandedBlocks, side)
          : []

        const visuals = key.isTwoWay
          ? computeTwoWayVisuals(key.blocks, key.placements, key.showBlockBorders)
          : computeMergeVisuals(key.blocks, key.placements, key.showBlockBorders, key.vividText)

        // In 2-way mode the `ours` pane doesn't exist — its visuals slot is always empty.
        const paneVisualZones = key.isTwoWay && side === 'ours' ? [] : visuals[side].viewZones

        index = buildLineTopIndex(lineHeight, toHiddenRanges(collapsedRegions), [
          ...toBannerZones(collapsedRegions),
          ...paneVisualZones.map((zone) => ({
            afterLineNumber: zone.afterLineNumber,
            heightInLines: zone.heightInLines,
          })),
        ])
        cache.indexes[side] = index
      }

      const top = index.topFor(lineNumber)
      cache.tops.set(memoKey, top)
      return top
    },
    [blocksRef, placementsRef]
  )
}
