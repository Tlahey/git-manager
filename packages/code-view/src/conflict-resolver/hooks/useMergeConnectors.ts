import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import type { editor } from 'monaco-editor'
import type { MergeBlock } from '../../types'
import type { BlockPlacement } from '../../mergeBlockLayout'
import type { ConnectorSegment } from '../../MergeConnectorOverlay'
import { updateConnectorPaths } from '../connectorPaths'
import { type SegmentGeometry, buildThreeWaySegments, buildTwoWaySegments } from '../connectorSegments'
import type { PaneSide } from '../collapsedRegions'
import { DEFAULT_LINE_HEIGHT } from '../../mergeViewConfig'
import type { MergeEditorRefs } from './useMergeEditorRefs'

interface UseMergeConnectorsParams {
  containerRef: RefObject<HTMLDivElement | null>
  editors: MergeEditorRefs
  blocksRef: MutableRefObject<MergeBlock[]>
  placementsRef: MutableRefObject<Map<number, BlockPlacement>>
  /** The resolver's collapse/zone-aware line-top geometry (see `getTopForLineNumberSafe`). */
  getTop: (paneEditor: editor.IStandaloneCodeEditor, lineNumber: number, side: PaneSide) => number
  isTwoWay: boolean
  collapseUnchanged: boolean
  expandedBlocks: Set<number>
  panelWidths: [number, number, number]
}

/** Owns everything about the SVG connector gaps: the segment geometry (recomputed in a rAF
 * batch whenever placements/layout/collapse state change), the scroll-driven imperative path
 * repaint, the shared wave phase offsets, and the container ResizeObserver that keeps the gap
 * overlays sized to the panes. */
export function useMergeConnectors({
  containerRef,
  editors,
  blocksRef,
  placementsRef,
  getTop,
  isTwoWay,
  collapseUnchanged,
  expandedBlocks,
  panelWidths,
}: UseMergeConnectorsParams) {
  const [gapHeight, setGapHeight] = useState(0)
  const [leftSegments, setLeftSegments] = useState<ConnectorSegment[]>([])
  const [rightSegments, setRightSegments] = useState<ConnectorSegment[]>([])
  const leftSegmentsRef = useRef<ConnectorSegment[]>([])
  const rightSegmentsRef = useRef<ConnectorSegment[]>([])
  const leftOverlayRef = useRef<HTMLDivElement | null>(null)
  const rightOverlayRef = useRef<HTMLDivElement | null>(null)
  // Each gap's own horizontal offset from containerRef, same measurement basis as
  // --wave-offset below. State (not just a ref) because it flows into MergeConnectorOverlay's
  // own JSX render as the wavePhaseOffset prop — the connector's wave is real path data
  // (buildCollapsedWavePath), not a CSS mask, so unlike --wave-offset it can't be corrected by
  // mutating a style property after the fact: React re-renders the path's `d` from JSX on
  // every segment update regardless, so an imperative `setAttribute` patch here would just get
  // overwritten by the next commit. The ref mirrors the same value for updateConnectorPaths,
  // which — being a scroll-driven imperative function outside React — genuinely does need to
  // read it without going through props.
  const [gapPhaseOffsets, setGapPhaseOffsets] = useState<{ left: number; right: number }>({ left: 0, right: 0 })
  const gapPhaseOffsetsRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 })

  // Written directly to the DOM (bypassing React state/render) from Monaco's own
  // `onDidScrollChange`, so the connector overlay's position tracks the panes' scroll at the
  // exact same synchronous moment Monaco updates itself, rather than catching up a render
  // cycle later. We update the connector paths in viewport space rather than shifting
  // the wrapper.
  const applyScrollOffset = useCallback(() => {
    const theirsEditor = editors.theirsEditorRef.current
    const centerEditor = editors.centerEditorRef.current
    const oursEditor = editors.oursEditorRef.current

    if (!theirsEditor || !centerEditor || (!isTwoWay && !oursEditor)) return

    const theirsScroll = theirsEditor.getScrollTop()
    const centerScroll = centerEditor.getScrollTop()
    const oursScroll = oursEditor ? oursEditor.getScrollTop() : 0

    updateConnectorPaths(
      leftOverlayRef.current,
      theirsScroll,
      centerScroll,
      leftSegmentsRef.current,
      'left',
      gapPhaseOffsetsRef.current.left
    )
    if (!isTwoWay) {
      updateConnectorPaths(
        rightOverlayRef.current,
        centerScroll,
        oursScroll,
        rightSegmentsRef.current,
        'right',
        gapPhaseOffsetsRef.current.right
      )
    }
  }, [editors, isTwoWay])

  useEffect(() => {
    applyScrollOffset()
  }, [leftSegments, rightSegments, applyScrollOffset])

  const connectorRafRef = useRef<number | null>(null)

  const recomputeConnectors = useCallback(() => {
    const theirsEditor = editors.theirsEditorRef.current
    const centerEditor = editors.centerEditorRef.current
    const oursEditor = editors.oursEditorRef.current
    if (!centerEditor || !theirsEditor || (!isTwoWay && !oursEditor)) return

    // Force layout calculation in Monaco to ensure editor structures are initialised
    theirsEditor.layout()
    centerEditor.layout()
    if (oursEditor) oursEditor.layout()

    const lineHeight = editors.monacoRef.current
      ? centerEditor.getOption(editors.monacoRef.current.editor.EditorOption.lineHeight)
      : DEFAULT_LINE_HEIGHT

    const editorFor = (side: PaneSide) =>
      side === 'ours' ? oursEditor : side === 'center' ? centerEditor : theirsEditor

    const geometry: SegmentGeometry = {
      getTop: (side, lineNumber) => {
        const paneEditor = editorFor(side)
        return paneEditor ? getTop(paneEditor, lineNumber, side) : 0
      },
      getZoneRect: (side, blockId) => {
        const paneEditor = editorFor(side)
        const domNode = paneEditor && typeof paneEditor.getDomNode === 'function' ? paneEditor.getDomNode() : null
        const element = domNode?.querySelector(`[data-zone-id="${blockId}-${side}"]`) as HTMLElement | null
        return element ? { top: element.offsetTop, height: element.offsetHeight } : null
      },
      lineHeight,
      collapseUnchanged,
      expandedBlocks,
    }

    const { left, right } = isTwoWay
      ? { left: buildTwoWaySegments(blocksRef.current, placementsRef.current, geometry), right: [] }
      : buildThreeWaySegments(blocksRef.current, placementsRef.current, geometry)

    leftSegmentsRef.current = left
    rightSegmentsRef.current = right
    setLeftSegments(left)
    setRightSegments(right)

    // Align wave phases across all panels and gaps
    if (containerRef.current) {
      const parentRect = containerRef.current.getBoundingClientRect()
      const elements = containerRef.current.querySelectorAll('.monaco-collapsed-zone-banner')
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect()
        const offset = -(rect.left - parentRect.left)
        ;(el as HTMLElement).style.setProperty('--wave-offset', `${offset}px`)
      })

      // Same shared phase for the connector's own wave. Measurement only, on purpose — see
      // gapPhaseOffsets' declaration for why this must flow through React state (as the
      // wavePhaseOffset prop) rather than an imperative DOM patch the way --wave-offset above
      // does; setGapPhaseOffsets below is what actually applies it.
      const measureGapOffset = (overlay: HTMLDivElement | null): number =>
        overlay ? overlay.getBoundingClientRect().left - parentRect.left : 0
      const nextGapPhaseOffsets = {
        left: measureGapOffset(leftOverlayRef.current),
        right: measureGapOffset(rightOverlayRef.current),
      }
      gapPhaseOffsetsRef.current = nextGapPhaseOffsets
      setGapPhaseOffsets((prev) =>
        prev.left === nextGapPhaseOffsets.left && prev.right === nextGapPhaseOffsets.right ? prev : nextGapPhaseOffsets
      )
    }
  }, [editors, blocksRef, placementsRef, containerRef, isTwoWay, collapseUnchanged, expandedBlocks, getTop])

  const scheduleRecompute = useCallback(() => {
    if (connectorRafRef.current !== null) return
    connectorRafRef.current = requestAnimationFrame(() => {
      connectorRafRef.current = null
      recomputeConnectors()
    })
  }, [recomputeConnectors])

  // Mount-time Monaco subscriptions (onDidLayoutChange in handlePaneMount) are registered once
  // and never re-subscribed, so they can only ever close over whatever scheduleRecompute (and
  // transitively recomputeConnectors, and expandedBlocks) was at that first render. Reading
  // through this ref instead keeps every such firing (e.g. a panel resize) using the *current*
  // expandedBlocks instead of silently treating already-expanded blocks as still collapsed.
  const scheduleRecomputeRef = useRef(scheduleRecompute)
  scheduleRecomputeRef.current = scheduleRecompute

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      setGapHeight(container.clientHeight)
      scheduleRecompute()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef, scheduleRecompute])

  // Dragging the pane resize handle (usePanelResize) only changes CSS flex-grow ratios via
  // panelWidths — the container's own size never changes, so the ResizeObserver above doesn't
  // fire, and Monaco's automaticLayout isn't enabled anywhere in this codebase, so a pure
  // CSS-driven resize doesn't make Monaco notice on its own either. Without this, connector
  // ribbons/waves (and the collapsed-region hidden areas effect, which also runs off
  // scheduleRecompute) kept using stale pre-resize positions until some unrelated trigger
  // happened to fire.
  useEffect(() => {
    scheduleRecompute()
  }, [panelWidths, scheduleRecompute])

  return {
    gapHeight,
    leftSegments,
    rightSegments,
    leftOverlayRef,
    rightOverlayRef,
    gapPhaseOffsets,
    applyScrollOffset,
    scheduleRecompute,
    scheduleRecomputeRef,
  }
}
