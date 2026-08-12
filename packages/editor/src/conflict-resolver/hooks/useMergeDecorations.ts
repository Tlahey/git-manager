import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { MergeBlock } from '../../types'
import type { BlockPlacement } from '../../mergeBlockLayout'
import { computeMergeVisuals } from '../../mergeDecorations'
import {
  computeIntraLineHighlights,
  computeTwoWayIntraLineHighlights,
} from '../../mergeIntraLineDiff'
import { computeTwoWayVisuals } from '../twoWayView'
import {
  applyViewZones,
  renderPane,
  toInlineMonacoDecoration,
  toMonacoDecoration,
} from '../monacoInterop'
import { blocksInCenterRange, type CenterLineRange } from '../visibleBlocks'
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
 * placement-changing action left behind.
 *
 * The word-level (intra-line) pass is deliberately NOT part of that effect. It is the one piece
 * whose cost scales with the number of *changed lines* rather than blocks — a Myers diff per
 * side↔center line pair — so it is scoped to the center pane's visible range and refreshed on
 * scroll through the returned `refreshIntraHighlights`. It writes to its own decoration
 * collections, so a scroll tick never re-sets a block fill or re-applies a view zone. */
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
  // Read inside the scroll-driven callback, which is registered once at pane mount and never
  // re-subscribed, so it cannot close over the current values.
  const placementsRef = useRef(placements)
  placementsRef.current = placements
  const highlightModeRef = useRef(highlightMode)
  highlightModeRef.current = highlightMode
  const isTwoWayRef = useRef(isTwoWay)
  isTwoWayRef.current = isTwoWay

  const intraRafRef = useRef<number | null>(null)

  const applyIntraHighlights = useCallback(() => {
    const centerEditor = editors.centerEditorRef.current
    if (!centerEditor) return

    const centerModel = centerEditor.getModel()
    const getCenterLine = (line: number) =>
      centerModel && line >= 1 && line <= centerModel.getLineCount()
        ? centerModel.getLineContent(line)
        : ''

    // Only the lines actually on screen. `getVisibleRanges` is absent from the test harness's
    // fake editor (and from a pane that hasn't laid out yet), in which case the whole file is
    // used — correct, just not bounded.
    const visibleRanges =
      typeof centerEditor.getVisibleRanges === 'function' ? centerEditor.getVisibleRanges() : []
    const range: CenterLineRange | null = visibleRanges.length
      ? {
          start: visibleRanges[0].startLineNumber,
          end: visibleRanges[visibleRanges.length - 1].endLineNumber,
        }
      : null

    const blocks = blocksInCenterRange(blocksRef.current, placementsRef.current, range)

    const intra =
      centerModel && highlightModeRef.current === 'words'
        ? isTwoWayRef.current
          ? computeTwoWayIntraLineHighlights(blocks, placementsRef.current, getCenterLine)
          : computeIntraLineHighlights(blocks, placementsRef.current, getCenterLine)
        : { ours: [], center: [], theirs: [] }

    editors.oursIntraDecorationsRef.current?.set(intra.ours.map(toInlineMonacoDecoration))
    editors.centerIntraDecorationsRef.current?.set(intra.center.map(toInlineMonacoDecoration))
    editors.theirsIntraDecorationsRef.current?.set(intra.theirs.map(toInlineMonacoDecoration))
  }, [editors, blocksRef])

  /** Scroll-side entry point: coalesced to one recompute per frame, since Monaco fires
   * `onDidScrollChange` far more often than that during an inertial scroll. */
  const refreshIntraHighlights = useCallback(() => {
    if (intraRafRef.current !== null) return
    intraRafRef.current = requestAnimationFrame(() => {
      intraRafRef.current = null
      applyIntraHighlights()
    })
  }, [applyIntraHighlights])

  useEffect(
    () => () => {
      if (intraRafRef.current !== null) {
        cancelAnimationFrame(intraRafRef.current)
        intraRafRef.current = null
      }
    },
    []
  )

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

    const showWholeLineHighlights = true
    if (!isTwoWay && editors.oursDecorationsRef.current) {
      editors.oursDecorationsRef.current.set(
        showWholeLineHighlights ? visuals.ours.decorations.map(toMonacoDecoration) : []
      )
    }
    editors.centerDecorationsRef.current?.set(
      showWholeLineHighlights ? visuals.center.decorations.map(toMonacoDecoration) : []
    )
    editors.theirsDecorationsRef.current?.set(
      showWholeLineHighlights ? visuals.theirs.decorations.map(toMonacoDecoration) : []
    )

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

    // Synchronously, not through the rAF path: a placement change (a gutter action, undo, typing)
    // must land in the same commit as the block fills it belongs to, or the two disagree for a
    // frame.
    applyIntraHighlights()

    /* Then flush, for the same reason the collapse pass does — with one extra consequence here. The
     * alignment/filler zones applied just above are measured back *out of the DOM* by the connector
     * builder (`getZoneRect` queries `[data-zone-id]`), and it runs on the next animation frame. Left
     * to Monaco's own render schedule, those elements might not exist yet, so a deletion's ribbon
     * measured zero-height and only got its shape from a later re-run on a timer. */
    renderPane(theirsEditor)
    renderPane(centerEditor)
    if (!isTwoWay) renderPane(oursEditor)

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

  return { refreshIntraHighlights }
}
