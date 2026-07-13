import { useEffect, type MutableRefObject } from 'react'
import type { MergeBlock } from '../../types'
import type { BlockPlacement } from '../../mergeBlockLayout'
import { computeMergeVisuals } from '../../mergeDecorations'
import {
  computeIntraLineHighlights,
  computeTwoWayIntraLineHighlights,
} from '../../mergeIntraLineDiff'
import { computeTwoWayVisuals } from '../twoWayView'
import { applyViewZones, toInlineMonacoDecoration, toMonacoDecoration } from '../monacoInterop'
import type { MergeEditorRefs } from './useMergeEditorRefs'

interface UseMergeDecorationsParams {
  editors: MergeEditorRefs
  editorsReady: boolean
  isTwoWay: boolean
  blocksRef: MutableRefObject<MergeBlock[]>
  placements: Map<number, BlockPlacement>
  showBlockBorders: boolean
  whitespaceMode: 'compare' | 'ignore' | 'trim'
  highlightMode: 'words' | 'lines'
  onPendingCountChange?: (count: number) => void
  scheduleRecompute: () => void
  updateActiveBlockIndex: () => void
  restoreSavedScrollTops: (isTwoWay: boolean) => void
}

/** Re-applies decorations and alignment view zones, and reschedules connector redraw, whenever
 * placements change. The per-pane specs (block colors, hermetic first/last borders, hatched
 * filler zones sized so all three panes stay vertically aligned) all come from
 * computeMergeVisuals/computeTwoWayVisuals — this effect only translates them into Monaco
 * calls, reports the pending-conflict count to the host, and restores any scroll snapshot a
 * placement-changing action left behind. */
export function useMergeDecorations({
  editors,
  editorsReady,
  isTwoWay,
  blocksRef,
  placements,
  showBlockBorders,
  whitespaceMode,
  highlightMode,
  onPendingCountChange,
  scheduleRecompute,
  updateActiveBlockIndex,
  restoreSavedScrollTops,
}: UseMergeDecorationsParams) {
  useEffect(() => {
    if (!editorsReady) return
    const oursEditor = editors.oursEditorRef.current
    const centerEditor = editors.centerEditorRef.current
    const theirsEditor = editors.theirsEditorRef.current
    if (!centerEditor || !theirsEditor || (!isTwoWay && !oursEditor)) return

    // Update whitespace option in Monaco editors dynamically
    const renderWhitespaceOption = whitespaceMode === 'compare' ? 'all' : 'none'
    if (!isTwoWay && oursEditor && typeof oursEditor.updateOptions === 'function')
      oursEditor.updateOptions({ renderWhitespace: renderWhitespaceOption })
    if (typeof centerEditor.updateOptions === 'function')
      centerEditor.updateOptions({ renderWhitespace: renderWhitespaceOption })
    if (typeof theirsEditor.updateOptions === 'function')
      theirsEditor.updateOptions({ renderWhitespace: renderWhitespaceOption })

    let pendingConflicts = 0
    for (const block of blocksRef.current) {
      const placement = placements.get(block.blockId)
      if (!placement) continue
      if (block.kind === 'both-different' && !placement.oursTouched && !placement.theirsTouched)
        pendingConflicts += 1
    }

    const visuals = isTwoWay
      ? computeTwoWayVisuals(
          blocksRef.current,
          placements,
          showBlockBorders,
          highlightMode === 'lines'
        )
      : computeMergeVisuals(
          blocksRef.current,
          placements,
          showBlockBorders,
          highlightMode === 'lines'
        )

    // Second diff pass (intra-line): reads the center buffer's live text so the highlights
    // track manual typing too. Only run if highlightMode is 'words'.
    const centerModel = centerEditor.getModel()
    const getCenterLine = (line: number) =>
      centerModel && line >= 1 && line <= centerModel.getLineCount()
        ? centerModel.getLineContent(line)
        : ''
    const intra =
      centerModel && highlightMode === 'words'
        ? isTwoWay
          ? computeTwoWayIntraLineHighlights(blocksRef.current, placements, getCenterLine)
          : computeIntraLineHighlights(blocksRef.current, placements, getCenterLine)
        : { ours: [], center: [], theirs: [] }

    const showWholeLineHighlights = true
    if (!isTwoWay && editors.oursDecorationsRef.current) {
      editors.oursDecorationsRef.current.set([
        ...(showWholeLineHighlights ? visuals.ours.decorations.map(toMonacoDecoration) : []),
        ...intra.ours.map(toInlineMonacoDecoration),
      ])
    }
    editors.centerDecorationsRef.current?.set([
      ...(showWholeLineHighlights ? visuals.center.decorations.map(toMonacoDecoration) : []),
      ...intra.center.map(toInlineMonacoDecoration),
    ])
    editors.theirsDecorationsRef.current?.set([
      ...(showWholeLineHighlights ? visuals.theirs.decorations.map(toMonacoDecoration) : []),
      ...intra.theirs.map(toInlineMonacoDecoration),
    ])

    if (!isTwoWay && oursEditor) {
      editors.oursZoneIdsRef.current = applyViewZones(
        oursEditor,
        editors.oursZoneIdsRef.current,
        visuals.ours.viewZones
      )
    }
    editors.centerZoneIdsRef.current = applyViewZones(
      centerEditor,
      editors.centerZoneIdsRef.current,
      visuals.center.viewZones
    )
    editors.theirsZoneIdsRef.current = applyViewZones(
      theirsEditor,
      editors.theirsZoneIdsRef.current,
      visuals.theirs.viewZones
    )

    onPendingCountChange?.(pendingConflicts)
    scheduleRecompute()
    updateActiveBlockIndex()

    restoreSavedScrollTops(isTwoWay)
    // Deliberately NOT keyed on every callback identity (matching the original inline effect):
    // this must re-run when the *visual inputs* change, not when e.g. scheduleRecompute picks
    // up a new closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    placements,
    editorsReady,
    showBlockBorders,
    whitespaceMode,
    highlightMode,
    updateActiveBlockIndex,
    isTwoWay,
  ])
}
