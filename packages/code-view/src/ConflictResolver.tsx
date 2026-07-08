import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ReactNode,
} from 'react'
import type { Monaco } from '@monaco-editor/react'
import type { editor, IRange } from 'monaco-editor'
import type { MergeBlock } from './types'
import { ConflictResolverHeader, type ConflictResolverActionsConfig } from './ConflictResolverHeader'
import { CodePane, type CodePaneEditorComponent } from './CodePane'
import { MergeConnectorOverlay, buildCollapsedWavePath, type ConnectorSegment } from './MergeConnectorOverlay'
import { useMergeScrollSync } from './useMergeScrollSync'
import {
  type BlockPlacement,
  type MergeSide,
  changeKindForBlock,
  centerLinesForBlock,
  computeInitialCenterText,
  computeInitialPlacements,
  connectorCenterRangeForSide,
  connectorClassForSide,
  deriveLivePlacements,
  isChangeSource,
  placementOverridesAfterAutoMerge,
  recomputeAllPlacements,
  updatePlacementAfterToggle,
  updatePlacementBothFlags,
} from './mergeBlockLayout'
import {
  type DecorationSpec,
  type ViewZoneSpec,
  blockDecorationSpecs,
  computeMergeVisuals,
  computePaneTotalLines,
  markerEdge,
} from './mergeDecorations'
import { type InlineDecorationSpec, computeIntraLineHighlights } from './mergeIntraLineDiff'

/** The slice of the app-side ThreeWayMergeView the resolver actually consumes. */
interface InternalMergeView {
  blocks: MergeBlock[]
  oursText: string
  theirsText: string
}

function buildDynamicMergeView(original: string, changes: editor.ILineChange[]): InternalMergeView {
  const originalLines = original.split('\n')

  const blocks: MergeBlock[] = changes.map((change, index) => {
    const originalStartLine = change.originalStartLineNumber
    const originalEndLine = change.originalEndLineNumber
    const modifiedStartLine = change.modifiedStartLineNumber
    const modifiedEndLine = change.modifiedEndLineNumber

    const originalCount = originalEndLine === 0 ? 0 : originalEndLine - originalStartLine + 1
    const modifiedCount = modifiedEndLine === 0 ? 0 : modifiedEndLine - modifiedStartLine + 1

    const theirsLines = originalLines.slice(Math.max(0, originalStartLine - 1), originalEndLine)

    return {
      blockId: index,
      kind: 'theirs-only',
      oursStartLine: modifiedStartLine, // carry modified start line for scroll sync
      oursLineCount: modifiedCount,     // carry modified line count for scroll sync
      theirsStartLine: originalStartLine,
      theirsLineCount: originalCount,
      oursLines: [],
      theirsLines,
      baseLines: theirsLines,
    }
  })

  return {
    blocks,
    oursText: '',
    theirsText: original,
  }
}

interface PaneVisualSpecs {
  decorations: DecorationSpec[]
  viewZones: ViewZoneSpec[]
}

interface TwoWayVisuals {
  ours: PaneVisualSpecs
  center: PaneVisualSpecs
  theirs: PaneVisualSpecs
}

function computeTwoWayVisuals(
  blocks: MergeBlock[],
  placements: Map<number, BlockPlacement>,
  showBlockBorders: boolean
): TwoWayVisuals {
  const theirs: PaneVisualSpecs = { decorations: [], viewZones: [] }
  const center: PaneVisualSpecs = { decorations: [], viewZones: [] }
  const ours: PaneVisualSpecs = { decorations: [], viewZones: [] }

  const paneTotals = computePaneTotalLines(blocks, placements)

  blocks.forEach((block) => {
    const placement = placements.get(block.blockId)
    if (!placement) return

    const originalStartLine = block.theirsStartLine
    const originalCount = block.theirsLineCount
    const modifiedStartLine = placement.centerStartLine
    const modifiedCount = placement.centerLineCount

    let kind: 'addition' | 'deletion' | 'modification' = 'modification'
    if (originalCount === 0) {
      kind = 'addition'
    } else if (modifiedCount === 0) {
      kind = 'deletion'
    }

    // 1. Left (Theirs / Original) pane visuals
    if (originalCount > 0) {
      theirs.decorations.push(...blockDecorationSpecs(originalStartLine, originalCount, kind, showBlockBorders, showBlockBorders, false))
    } else {
      // Pure addition (Left has 0 lines): render boundary marker line
      const afterLine = originalStartLine - 1
      const edge = markerEdge(afterLine, paneTotals.theirs)
      const className = `merge-marker-${edge}-${kind}`
      const line = Math.min(afterLine + 1, Math.max(1, paneTotals.theirs))
      theirs.decorations.push({ startLine: line, endLine: line, className, marginClassName: className })
    }

    // 2. Right (Center / Modified) pane visuals
    if (modifiedCount > 0) {
      center.decorations.push(...blockDecorationSpecs(modifiedStartLine, modifiedCount, kind, showBlockBorders, showBlockBorders, false))
    } else {
      // Pure deletion (Right has 0 lines): render boundary marker line
      const afterLine = modifiedStartLine - 1
      const edge = markerEdge(afterLine, paneTotals.center)
      const className = `merge-marker-${edge}-${kind}`
      const line = Math.min(afterLine + 1, Math.max(1, paneTotals.center))
      center.decorations.push({ startLine: line, endLine: line, className, marginClassName: className })
    }
  })

  return { theirs, center, ours }
}

/** One entry per pane, in visual order. 2 panels = side-by-side diff (original | modified),
 * read-only, block geometry computed live by Monaco's own diff engine. 3 panels = full merge
 * view (incoming | result | current) driven by `blocks`; the middle panel's initial content is
 * always derived from `blocks` (its `content` is ignored). */
export interface ConflictResolverPanel {
  /** Pane text. Ignored for the middle panel in 3-panel mode (derived from `blocks`). */
  content?: string
  /** Node rendered above this pane in the header status bar (3-panel mode only). */
  status?: ReactNode
}

/** Everything monaco-related the host may want to override — all optional, the resolver works
 * out of the box with the stock `@monaco-editor/react` Editor and monaco's built-in themes. */
export interface ConflictResolverEditorConfig {
  /** Replacement editor component (e.g. a shared lazy-loaded instance). */
  component?: CodePaneEditorComponent
  /** Monaco language id applied to every pane (e.g. 'typescript'). */
  language?: string
  /** Monaco theme name; register custom themes from `onEditorMount`. */
  theme?: string
  loadingFallback?: ReactNode
  /** Called after each pane's own internal mount wiring, e.g. to register custom themes. */
  onEditorMount?: (
    editorInstance: editor.IStandaloneCodeEditor,
    monacoInstance: Monaco,
    pane: 'ours' | 'center' | 'theirs'
  ) => void
}

export interface ConflictResolverProps {
  panels: ConflictResolverPanel[]
  /** Merge blocks for 3-panel mode — structurally compatible with git-types' `MergeBlock`. */
  blocks?: MergeBlock[]
  /** Unique prefix for the panes' monaco model URIs (e.g. the file path). Changing it resets
   * per-file state (placements, undo history, panel widths). */
  modelPathPrefix: string
  editor?: ConflictResolverEditorConfig
  /** `false` hides the toolbar/status header entirely; an object toggles individual buttons
   * (see ConflictResolverActionsConfig). The header only renders in 3-panel mode. */
  header?: boolean | ConflictResolverActionsConfig
  /** Wand/auto-merge provider: resolves to the merged text for the result pane. The wand
   * button only shows when this is wired. */
  onAutoMerge?: () => Promise<string>
  /** Host hook behind the recalculate button (e.g. re-fetch the merge view). The button only
   * shows when this is wired. */
  onRecalculate?: () => void
  onPendingCountChange?: (count: number) => void
  /** Draw the JetBrains-style hermetic 2px top/bottom edges around each block (and the matching
   * closing edges on the hatched filler zones). Off by default — the colored fills alone. */
  showBlockBorders?: boolean
  defaultCollapseUnchanged?: boolean
}

export interface ConflictResolverRef {
  getCenterValue: () => string
  applyAutoMerge: () => Promise<void>
  acceptLeft: () => void
  acceptRight: () => void
  goToNextChange: () => void
  goToPreviousChange: () => void
}

interface HistoryEntry {
  prePlacements: Map<number, BlockPlacement>
  postPlacements: Map<number, BlockPlacement>
  altIdBefore: number
  altIdAfter: number
  textChange: boolean
}

// Wide enough to comfortably fit the two accept/ignore buttons side by side (see
// MergeConnectorOverlay) plus the ribbon curve.
const GAP_WIDTH = 40

/** `DecorationSpec.endLine` is already inclusive (see mergeDecorations.ts) — exactly what
 * `isWholeLine: true` expects, no boundary adjustment here.
 *
 * `className`/`marginClassName` carry different fill intensities (muted `merge-text-*` vs.
 * vivid `merge-vivid-*` — see mergeDecorations.ts): a heavy fill behind actual code
 * text fights with legibility, but the same intensity in the gutter/line-number margin (no text
 * to compete with) reads better vivid. `lineNumberClassName` turned out to only color the
 * line-number digit's own narrow div, not the full gutter row — `marginClassName` is the one
 * that paints the whole margin width (line numbers + the reserved lineDecorationsWidth strip
 * together). */
function toMonacoDecoration(spec: DecorationSpec): editor.IModelDeltaDecoration {
  const range: IRange = { startLineNumber: spec.startLine, startColumn: 1, endLineNumber: spec.endLine, endColumn: 1 }
  // `zIndex` is defensive: without it, decorations can render underneath other decoration
  // layers Monaco itself manages (current-line highlight, etc.) depending on paint order.
  return {
    range,
    options: { isWholeLine: true, className: spec.className, marginClassName: spec.marginClassName, zIndex: 10 },
  }
}

/** Intra-line (character-precise) highlight: `inlineClassName` styles just the changed span of
 * text inside a line, over the block's whole-line fill — no `isWholeLine`, and no margin class
 * (the gutter belongs to the block, not to a word). */
function toInlineMonacoDecoration(spec: InlineDecorationSpec): editor.IModelDeltaDecoration {
  const range: IRange = {
    startLineNumber: spec.line,
    startColumn: spec.startColumn,
    endLineNumber: spec.line,
    endColumn: spec.endColumn,
  }
  return { range, options: { inlineClassName: spec.inlineClassName, zIndex: 11 } }
}

/** Replaces a pane's alignment filler zones wholesale (remove previous, add current) inside a
 * single `changeViewZones` transaction — zones are recomputed from scratch on every placement
 * change (mirroring how decorations are re-`set()`), so there's no per-zone diffing to do.
 * Removing an id Monaco no longer knows (it drops all zones itself when the pane's model is
 * swapped on file switch) is a harmless no-op. Returns the new zone ids for the next call. */
function applyViewZones(
  editorInstance: editor.IStandaloneCodeEditor,
  previousIds: string[],
  specs: ViewZoneSpec[]
): string[] {
  const ids: string[] = []
  editorInstance.changeViewZones((accessor) => {
    for (const id of previousIds) accessor.removeZone(id)
    for (const spec of specs) {
      const domNode = document.createElement('div')
      domNode.className = spec.className
      if (spec.id) {
        domNode.setAttribute('data-zone-id', spec.id)
      }
      ids.push(accessor.addZone({ afterLineNumber: spec.afterLineNumber, heightInLines: spec.heightInLines, domNode }))
    }
  })
  return ids
}

/** Computes the Monaco edit range/text for replacing an explicit `[startLine, startLine+lineCount)`
 * range with `newLines` — used both to replace a side's existing content and, when `lineCount`
 * is 0, to insert content at that boundary (accepting a side that wasn't included before).
 * Extends into the start of the following line to consume the range's own trailing newline
 * (clean full removal when `newLines` is empty) — except at the very end of the document, where
 * there's no following line, so the *preceding* line's newline is consumed instead. */
function buildRangeEdit(
  model: editor.ITextModel,
  startLine: number,
  lineCount: number,
  newLines: string[]
): { range: IRange; text: string } {
  const totalLines = model.getLineCount()

  if (startLine + lineCount <= totalLines) {
    return {
      range: { startLineNumber: startLine, startColumn: 1, endLineNumber: startLine + lineCount, endColumn: 1 },
      text: newLines.length > 0 ? newLines.join('\n') + '\n' : '',
    }
  }

  const lastLine = Math.min(Math.max(startLine + lineCount - 1, startLine), totalLines)
  const lastCol = model.getLineMaxColumn(lastLine)
  if (startLine > 1) {
    const prevLine = startLine - 1
    return {
      range: { startLineNumber: prevLine, startColumn: model.getLineMaxColumn(prevLine), endLineNumber: lastLine, endColumn: lastCol },
      text: newLines.length > 0 ? '\n' + newLines.join('\n') : '',
    }
  }
  return {
    range: { startLineNumber: startLine, startColumn: 1, endLineNumber: lastLine, endColumn: lastCol },
    text: newLines.join('\n'),
  }
}

function checkTextChanges(
  model: editor.ITextModel,
  startLine: number,
  lineCount: number,
  newLines: string[]
): boolean {
  if (lineCount !== newLines.length) return true
  for (let i = 0; i < lineCount; i++) {
    if (model.getLineContent(startLine + i) !== newLines[i]) return true
  }
  return false
}

function updateConnectorPaths(
  overlayElement: HTMLDivElement | null,
  scrollTopLeft: number,
  scrollTopRight: number,
  segments: ConnectorSegment[],
  side: 'left' | 'right',
  wavePhaseOffset: number
) {
  if (!overlayElement) return

  const half = GAP_WIDTH / 2
  const width = GAP_WIDTH

  // 1. Update SVG paths
  const paths = overlayElement.querySelectorAll('path')
  let pathIdx = 0

  segments.forEach((seg) => {
    const leftY0 = seg.leftY0 - scrollTopLeft
    const leftY1 = seg.leftY1 - scrollTopLeft
    const rightY0 = seg.rightY0 - scrollTopRight
    const rightY1 = seg.rightY1 - scrollTopRight

    if (seg.colorClass === 'merge-connector-collapsed') {
      // Mirrors the <g> the JSX renders: fill path (closed quadrilateral, invisible hit-target)
      // then the wave stroke — in that order.
      const d = [
        `M 0,${leftY0}`,
        `C ${half},${leftY0} ${half},${rightY0} ${width},${rightY0}`,
        `L ${width},${rightY1}`,
        `C ${half},${rightY1} ${half},${leftY1} 0,${leftY1}`,
        'Z',
      ].join(' ')
      const dWave = buildCollapsedWavePath((leftY0 + leftY1) / 2, (rightY0 + rightY1) / 2, width, wavePhaseOffset)

      const pathElFill = paths[pathIdx++] as SVGPathElement | undefined
      if (pathElFill) pathElFill.setAttribute('d', d)

      const pathElWave = paths[pathIdx++] as SVGPathElement | undefined
      if (pathElWave) pathElWave.setAttribute('d', dWave)
      return
    }

    if (seg.flat) {
      const d = `M 0,${leftY0} C ${half},${leftY0} ${half},${rightY0} ${width},${rightY0}`
      const pathEl = paths[pathIdx++] as SVGPathElement | undefined
      if (pathEl) pathEl.setAttribute('d', d)
    } else if (seg.resolved) {
      const dTop = `M 0,${leftY0 + 1} C ${half},${leftY0 + 1} ${half},${rightY0 + 1} ${width},${rightY0 + 1}`
      const dBottom = `M 0,${leftY1 - 1} C ${half},${leftY1 - 1} ${half},${rightY1 - 1} ${width},${rightY1 - 1}`

      const pathElTop = paths[pathIdx++] as SVGPathElement | undefined
      if (pathElTop) pathElTop.setAttribute('d', dTop)

      const pathElBottom = paths[pathIdx++] as SVGPathElement | undefined
      if (pathElBottom) pathElBottom.setAttribute('d', dBottom)
    } else {
      const d = [
        `M 0,${leftY0}`,
        `C ${half},${leftY0} ${half},${rightY0} ${width},${rightY0}`,
        `L ${width},${rightY1}`,
        `C ${half},${rightY1} ${half},${leftY1} 0,${leftY1}`,
        'Z',
      ].join(' ')

      const pathEl = paths[pathIdx++] as SVGPathElement | undefined
      if (pathEl) pathEl.setAttribute('d', d)
    }
  })

  // 2. Update action button positions
  const buttonContainers = overlayElement.querySelectorAll('.merge-connector-action-container')
  let btnIdx = 0

  segments.forEach((seg) => {
    if (!seg.actionable) return
    const anchorY = side === 'left' ? seg.leftY0 - scrollTopLeft : seg.rightY0 - scrollTopRight
    const btnContainer = buttonContainers[btnIdx++] as HTMLDivElement | undefined
    if (btnContainer) {
      btnContainer.style.top = `${anchorY}px`
    }
  })

}

/** JetBrains-style multi-panel code/merge editor. In 3-panel mode: left = theirs (the incoming
 * change being applied, read-only), center = editable result, right = ours (the local/current
 * side, read-only) — matching WebStorm's merge/rebase dialog, which puts what you're merging IN
 * on the left and your own code on the right. Accept/ignore buttons live in the connector gaps
 * (see MergeConnectorOverlay), anchored against the pane that authored the change; a genuine
 * conflict is actionable from both gaps and its sides toggle independently (accepting ours
 * doesn't exclude theirs, so both can end up in the result together), while a one-sided change
 * is only actionable from its source gap and resolves exclusively — accept swaps the block's
 * center content to that side, ignore restores the other (ancestor-mirroring) side. The magic
 * wand (imperative `applyAutoMerge`, host-provided via `onAutoMerge`) auto-merges every
 * non-conflicting block at once. Blocks are color-coded and connected across the gaps by
 * `MergeConnectorOverlay`. In 2-panel mode it renders a read-only side-by-side diff whose block
 * geometry is computed live by Monaco's own diff engine. */
export function setCollapsedBlockHover(blockId: number, active: boolean) {
  const elements = document.querySelectorAll(`[data-collapsed-block-id="${blockId}"]`)
  elements.forEach((el) => {
    if (active) {
      el.classList.add('is-hovered')
    } else {
      el.classList.remove('is-hovered')
    }
  })
}

export function getTopForLineNumberSafe(
  editor: editor.IStandaloneCodeEditor,
  lineNumber: number,
  lineHeight: number,
  hiddenRanges: { start: number; end: number }[],
  viewZones: { afterLineNumber: number; heightInLines: number }[]
): number {
  if (lineNumber <= 1) return 0

  // If the line itself is inside a hidden range, its top is the bottom of the last visible line before the range
  for (const range of hiddenRanges) {
    if (lineNumber >= range.start && lineNumber <= range.end) {
      return getTopForLineNumberSafe(editor, range.start - 1, lineHeight, hiddenRanges, viewZones) + lineHeight
    }
  }

  let y = 0
  for (let i = 1; i < lineNumber; i++) {
    let hidden = false
    for (const range of hiddenRanges) {
      if (i >= range.start && i <= range.end) {
        hidden = true
        break
      }
    }
    if (!hidden) {
      y += lineHeight
    }
    for (const zone of viewZones) {
      if (zone.afterLineNumber === i) {
        y += zone.heightInLines * lineHeight
      }
    }
  }
  return y
}

export const ConflictResolver = forwardRef<ConflictResolverRef, ConflictResolverProps>(
  (
    {
      panels: panelsInput,
      blocks,
      modelPathPrefix,
      editor: editorConfig,
      header = true,
      onAutoMerge,
      onRecalculate,
      onPendingCountChange,
      showBlockBorders = false,
      defaultCollapseUnchanged = false,
    },
    ref
  ) => {
    const isTwoWay = panelsInput.length === 2
    const original = isTwoWay ? panelsInput[0]?.content : undefined
    const modified = isTwoWay ? panelsInput[1]?.content : undefined

    const [monaco, setMonaco] = useState<Monaco | null>(null)
    const [dynamicView, setDynamicView] = useState<InternalMergeView | null>(null)

    const dummyView = useMemo<InternalMergeView>(() => ({ blocks: [], oursText: '', theirsText: '' }), [])

    const staticView = useMemo<InternalMergeView>(
      () => ({
        blocks: blocks ?? [],
        oursText: panelsInput[2]?.content ?? '',
        theirsText: panelsInput[0]?.content ?? '',
      }),
      [blocks, panelsInput]
    )

    const viewToUse = isTwoWay ? (dynamicView ?? dummyView) : staticView

    const containerRef = useRef<HTMLDivElement | null>(null)
    const blocksRef = useRef<MergeBlock[]>(viewToUse.blocks)
    blocksRef.current = viewToUse.blocks

    const initialCenterText = useMemo(() => {
      if (isTwoWay) return modified ?? ''
      return computeInitialCenterText(viewToUse.blocks)
    }, [isTwoWay, modified, viewToUse.blocks])

    const [placements, setPlacements] = useState<Map<number, BlockPlacement>>(() => {
      if (isTwoWay) return new Map()
      return computeInitialPlacements(viewToUse.blocks)
    })
    const placementsRef = useRef(placements)
    placementsRef.current = placements

    const updatePlacementsStateAndRef = useCallback((next: Map<number, BlockPlacement>) => {
      placementsRef.current = next
      setPlacements(next)
    }, [])

    const [whitespaceMode, setWhitespaceMode] = useState<'compare' | 'ignore' | 'trim'>('compare')

    // Compute diff dynamically in 2-way mode
    useEffect(() => {
      if (!isTwoWay || !monaco || original === undefined || modified === undefined) return

      const originalModel = monaco.editor.createModel(original, undefined, monaco.Uri.parse(`inmemory://original-${Math.random()}`))
      const modifiedModel = monaco.editor.createModel(modified, undefined, monaco.Uri.parse(`inmemory://modified-${Math.random()}`))

      const container = document.createElement('div')
      const diffEditor = monaco.editor.createDiffEditor(container, {
        ignoreTrimWhitespace: whitespaceMode === 'ignore',
      })

      diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel,
      })

      const disposable = diffEditor.onDidUpdateDiff(() => {
        const changes = diffEditor.getLineChanges() || []
        const parsedView = buildDynamicMergeView(original, changes)
        setDynamicView(parsedView)
      })

      return () => {
        disposable.dispose()
        diffEditor.dispose()
        originalModel.dispose()
        modifiedModel.dispose()
      }
    }, [isTwoWay, monaco, original, modified, whitespaceMode])

    // Update placements when dynamicView updates in 2-way mode
    useEffect(() => {
      if (isTwoWay && dynamicView) {
        const initialPlacements = new Map<number, BlockPlacement>()
        dynamicView.blocks.forEach((block) => {
          initialPlacements.set(block.blockId, {
            blockId: block.blockId,
            centerStartLine: block.oursStartLine, // modified start line!
            centerLineCount: block.oursLineCount, // modified line count!
            oursIncluded: false,
            theirsIncluded: false,
            oursTouched: false,
            theirsTouched: false,
          })
        })
        updatePlacementsStateAndRef(initialPlacements)
      }
    }, [isTwoWay, dynamicView, updatePlacementsStateAndRef])

    const [highlightMode, setHighlightMode] = useState<'words' | 'lines'>('words')
    const [collapseUnchanged, setCollapseUnchanged] = useState(defaultCollapseUnchanged)
    const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(new Set())

    useEffect(() => {
      setExpandedBlocks(new Set())
    }, [collapseUnchanged])

    const getTop = useCallback((editor: editor.IStandaloneCodeEditor, lineNumber: number, side: 'ours' | 'theirs' | 'center'): number => {
      const lineHeight = monacoRef.current && centerEditorRef.current
        ? centerEditorRef.current.getOption(monacoRef.current.editor.EditorOption.lineHeight)
        : 19

      const theirsCollapsedZones: { afterLineNumber: number; heightInLines: number }[] = []
      const theirsHiddenRanges: { start: number; end: number }[] = []
      if (collapseUnchanged) {
        for (const block of blocksRef.current) {
          if (block.kind === 'unchanged' && !expandedBlocks.has(block.blockId)) {
            const lineCount = block.theirsLineCount
            if (lineCount > 6) {
              const startHide = block.theirsStartLine + 3
              const endHide = block.theirsStartLine + block.theirsLineCount - 4
              theirsHiddenRanges.push({ start: startHide, end: endHide })
              theirsCollapsedZones.push({ afterLineNumber: startHide - 1, heightInLines: 1.5 })
            }
          }
        }
      }

      const oursCollapsedZones: { afterLineNumber: number; heightInLines: number }[] = []
      const oursHiddenRanges: { start: number; end: number }[] = []
      if (collapseUnchanged) {
        for (const block of blocksRef.current) {
          if (block.kind === 'unchanged' && !expandedBlocks.has(block.blockId)) {
            const lineCount = block.oursLineCount
            if (lineCount > 6) {
              const startHide = block.oursStartLine + 3
              const endHide = block.oursStartLine + block.oursLineCount - 4
              oursHiddenRanges.push({ start: startHide, end: endHide })
              oursCollapsedZones.push({ afterLineNumber: startHide - 1, heightInLines: 1.5 })
            }
          }
        }
      }

      const centerCollapsedZones: { afterLineNumber: number; heightInLines: number }[] = []
      const centerHiddenRanges: { start: number; end: number }[] = []
      if (collapseUnchanged) {
        for (const block of blocksRef.current) {
          if (block.kind === 'unchanged' && !expandedBlocks.has(block.blockId)) {
            const placement = placementsRef.current.get(block.blockId)
            if (placement) {
              const lineCount = placement.centerLineCount
              if (lineCount > 6) {
                const startHide = placement.centerStartLine + 3
                const endHide = placement.centerStartLine + placement.centerLineCount - 4
                centerHiddenRanges.push({ start: startHide, end: endHide })
                centerCollapsedZones.push({ afterLineNumber: startHide - 1, heightInLines: 1.5 })
              }
            }
          }
        }
      }

      const visuals = isTwoWay
        ? computeTwoWayVisuals(blocksRef.current, placementsRef.current, showBlockBorders)
        : computeMergeVisuals(blocksRef.current, placementsRef.current, showBlockBorders, highlightMode === 'lines')

      const theirsViewZones = [
        ...theirsCollapsedZones,
        ...(visuals ? visuals.theirs.viewZones.map(vz => ({ afterLineNumber: vz.afterLineNumber, heightInLines: vz.heightInLines })) : [])
      ]

      const oursViewZones = [
        ...oursCollapsedZones,
        ...(visuals && !isTwoWay ? visuals.ours.viewZones.map(vz => ({ afterLineNumber: vz.afterLineNumber, heightInLines: vz.heightInLines })) : [])
      ]

      const centerViewZones = [
        ...centerCollapsedZones,
        ...(visuals ? visuals.center.viewZones.map(vz => ({ afterLineNumber: vz.afterLineNumber, heightInLines: vz.heightInLines })) : [])
      ]

      const hiddenRanges = side === 'theirs' ? theirsHiddenRanges : side === 'ours' ? oursHiddenRanges : centerHiddenRanges
      const viewZones = side === 'theirs' ? theirsViewZones : side === 'ours' ? oursViewZones : centerViewZones
      return getTopForLineNumberSafe(editor, lineNumber, lineHeight, hiddenRanges, viewZones)
    }, [isTwoWay, collapseUnchanged, expandedBlocks, highlightMode, showBlockBorders])




    // Dynamic conflict/change stats
    const { changesCount, conflictsCount } = useMemo(() => {
      let conflicts = 0
      let changes = 0

      for (const block of viewToUse.blocks) {
        if (block.kind === 'unchanged') continue

        const placement = placements.get(block.blockId)
        if (!placement) continue

        if (block.kind === 'both-different') {
          if (!placement.oursTouched && !placement.theirsTouched) {
            conflicts++
          }
          changes++
        } else {
          if (!placement.oursTouched && !placement.theirsTouched) {
            changes++
          }
        }
      }

      return { changesCount: changes, conflictsCount: conflicts }
    }, [viewToUse.blocks, placements])

    const [editorsReady, setEditorsReady] = useState(false)
    const [panelWidths, setPanelWidths] = useState<[number, number, number]>(() =>
      isTwoWay ? [50, 50, 0] : [33.333, 33.334, 33.333]
    )

    const handleLeftMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.merge-connector-action')) {
          return
        }
        e.preventDefault()

        const startX = e.clientX
        const startLeftPct = panelWidths[0]
        const startCenterPct = panelWidths[1]
        const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0
        const panelsWidth = containerWidth - (isTwoWay ? GAP_WIDTH : GAP_WIDTH * 2)

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const dx = moveEvent.clientX - startX
          const dPct = (dx / panelsWidth) * 100

          let newLeft = startLeftPct + dPct
          let newCenter = startCenterPct - dPct
          const sum = startLeftPct + startCenterPct
          const minPct = Math.min(33.3, (150 / panelsWidth) * 100)

          if (newLeft < minPct) {
            newLeft = minPct
            newCenter = sum - minPct
          } else if (newCenter < minPct) {
            newCenter = minPct
            newLeft = sum - minPct
          }

          setPanelWidths((prev) => [newLeft, newCenter, prev[2]])
        }

        const handleMouseUp = () => {
          window.removeEventListener('mousemove', handleMouseMove)
          window.removeEventListener('mouseup', handleMouseUp)
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
      },
      [panelWidths, containerRef, isTwoWay]
    )

    const handleRightMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.merge-connector-action')) {
          return
        }
        e.preventDefault()

        const startX = e.clientX
        const startCenterPct = panelWidths[1]
        const startRightPct = panelWidths[2]
        const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0
        const panelsWidth = containerWidth - GAP_WIDTH * 2

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const dx = moveEvent.clientX - startX
          const dPct = (dx / panelsWidth) * 100

          let newCenter = startCenterPct + dPct
          let newRight = startRightPct - dPct
          const sum = startCenterPct + startRightPct
          const minPct = Math.min(33.3, (150 / panelsWidth) * 100)

          if (newCenter < minPct) {
            newCenter = minPct
            newRight = sum - minPct
          } else if (newRight < minPct) {
            newRight = minPct
            newCenter = sum - minPct
          }

          setPanelWidths((prev) => [prev[0], newCenter, newRight])
        }

        const handleMouseUp = () => {
          window.removeEventListener('mousemove', handleMouseMove)
          window.removeEventListener('mouseup', handleMouseUp)
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
      },
      [panelWidths, containerRef]
    )

    const monacoRef = useRef<Monaco | null>(null)
    const oursEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const centerEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const theirsEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

    const oursDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
    const centerDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)
    const theirsDecorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null)

    // Ids of the currently-injected alignment view zones per pane (see applyViewZones) — plain
    // refs, not state: they're pure bookkeeping for the next wholesale replacement, never read
    // during render.
    const oursZoneIdsRef = useRef<string[]>([])
    const centerZoneIdsRef = useRef<string[]>([])
    const theirsZoneIdsRef = useRef<string[]>([])

    // Bookkeeping for collapsed code view zones
    const oursCollapsedViewZonesRef = useRef<string[]>([])
    const centerCollapsedViewZonesRef = useRef<string[]>([])
    const theirsCollapsedViewZonesRef = useRef<string[]>([])


    // Undo/redo-aware bookkeeping: every gutter/wand action snapshots the placements map it's
    // about to replace onto `historyRef` and clears `redoRef` (new branch of history, matching
    // normal editor semantics). `isApplyingOwnEditRef` is set for the duration of our own
    // `executeEdits` calls so the center pane's content-change listener (below) can tell "we
    // just made this edit ourselves" apart from a genuine undo/redo/manual keystroke — without
    // this, Ctrl+Z would change the buffer text back but leave gutter widgets/colors stuck on
    // whatever they were set to by the action being undone.
    const historyRef = useRef<HistoryEntry[]>([])
    const redoRef = useRef<HistoryEntry[]>([])
    const isApplyingOwnEditRef = useRef(false)
    const isUndoingGutterActionRef = useRef(false)
    const isRedoingGutterActionRef = useRef(false)
    const ignoreScrollSyncRef = useRef(false)
    const savedScrollTopsRef = useRef<{ ours: number; center: number; theirs: number } | null>(null)

    const saveScrollTopsAndPauseSync = useCallback(() => {
      const oursEditor = oursEditorRef.current
      const centerEditor = centerEditorRef.current
      const theirsEditor = theirsEditorRef.current
      if (oursEditor && centerEditor && theirsEditor) {
        savedScrollTopsRef.current = {
          ours: oursEditor.getScrollTop(),
          center: centerEditor.getScrollTop(),
          theirs: theirsEditor.getScrollTop(),
        }
        ignoreScrollSyncRef.current = true
      }
    }, [])

    const executeWithScrollPreservation = useCallback((action: () => void) => {
      saveScrollTopsAndPauseSync()
      let completed = false
      try {
        action()
        completed = true
      } finally {
        if (!completed) {
          ignoreScrollSyncRef.current = false
          savedScrollTopsRef.current = null
        } else {
          // Safety timeout in case placements useEffect doesn't trigger
          setTimeout(() => {
            if (savedScrollTopsRef.current) {
              ignoreScrollSyncRef.current = false
              savedScrollTopsRef.current = null
            }
          }, 150)
        }
      }
    }, [saveScrollTopsAndPauseSync])

    // Reset per-file state when switching to a different file. `placements` is otherwise only
    // ever seeded once (the `useState` lazy initializer above only runs on the component's
    // first mount) — CodePane's `value`/`path` props already make the pane *text* switch to
    // the new file correctly, but without this, decorations/colors and undo history would keep
    // pointing at the *previous* file's blocks. Keyed on modelPathPrefix rather than on the
    // blocks themselves, since the host can hand back freshly-fetched (but identical) blocks
    // for the *same* file on revalidation — that shouldn't wipe in-progress edits.
    useEffect(() => {
      if (!isTwoWay) {
        updatePlacementsStateAndRef(computeInitialPlacements(viewToUse.blocks))
      }
      historyRef.current = []
      redoRef.current = []
      setPanelWidths(isTwoWay ? [50, 50, 0] : [33.333, 33.334, 33.333])
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelPathPrefix, updatePlacementsStateAndRef, isTwoWay])

    const { attach: attachScrollSync } = useMergeScrollSync(blocksRef, placementsRef, monacoRef, getTop, ignoreScrollSyncRef)

    const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0)

    const changeBlocks = useMemo(() => {
      return viewToUse.blocks.filter((b) => b.kind !== 'unchanged')
    }, [viewToUse.blocks])

    const updateActiveBlockIndex = useCallback(() => {
      const centerEditor = centerEditorRef.current
      if (!centerEditor) return

      if (changeBlocks.length === 0) {
        setActiveBlockIndex(-1)
        return
      }

      const visibleRanges = typeof centerEditor.getVisibleRanges === 'function' ? centerEditor.getVisibleRanges() : []
      const currentLine = visibleRanges.length > 0 ? visibleRanges[0].startLineNumber : 1

      let foundIndex = -1
      for (let i = 0; i < changeBlocks.length; i++) {
        const p = placementsRef.current.get(changeBlocks[i].blockId)
        if (p) {
          if (p.centerStartLine >= currentLine) {
            foundIndex = i
            break
          }
          if (currentLine >= p.centerStartLine && currentLine < p.centerStartLine + p.centerLineCount) {
            foundIndex = i
            break
          }
        }
      }

      if (foundIndex === -1) {
        foundIndex = changeBlocks.length - 1
      }

      setActiveBlockIndex(foundIndex)
    }, [changeBlocks])

    // Scroll and focus next/prev conflict
    const navigateConflict = useCallback((direction: 'next' | 'prev') => {
      const centerEditor = centerEditorRef.current
      if (!centerEditor || changeBlocks.length === 0) return

      let targetIndex = activeBlockIndex
      if (direction === 'next') {
        if (activeBlockIndex < changeBlocks.length - 1) {
          targetIndex = activeBlockIndex + 1
        } else {
          return // Boundary reached
        }
      } else {
        if (activeBlockIndex > 0) {
          targetIndex = activeBlockIndex - 1
        } else {
          return // Boundary reached
        }
      }

      const targetBlock = changeBlocks[targetIndex]
      if (targetBlock) {
        const p = placementsRef.current.get(targetBlock.blockId)
        if (p) {
          centerEditor.revealLineInCenter(p.centerStartLine)
          centerEditor.setPosition({ lineNumber: p.centerStartLine, column: 1 })
          centerEditor.focus()
          setActiveBlockIndex(targetIndex)
        }
      }
    }, [activeBlockIndex, changeBlocks])

    // Apply non-conflicting changes (Left, Right, or both sides)
    const applyNonConflicting = useCallback((side: 'left' | 'right' | 'all') => {
      const centerEditor = centerEditorRef.current
      const model = centerEditor?.getModel()
      if (!centerEditor || !model) return

      executeWithScrollPreservation(() => {
        const altIdBefore = model.getAlternativeVersionId()
        const prePlacements = placementsRef.current

        let nextPlacements = new Map(prePlacements)
        let changedAny = false

        for (const block of blocksRef.current) {
          const current = prePlacements.get(block.blockId)
          if (!current || current.oursTouched || current.theirsTouched) continue

          const isLeftChange = block.kind === 'theirs-only'
          const isRightChange = block.kind === 'ours-only'

          if (isLeftChange && (side === 'left' || side === 'all')) {
            const kind = changeKindForBlock(block)
            const theirsInc = kind !== 'deletion'
            nextPlacements = updatePlacementBothFlags(nextPlacements, blocksRef.current, block, false, theirsInc)
            changedAny = true
          } else if (isRightChange && (side === 'right' || side === 'all')) {
            const kind = changeKindForBlock(block)
            const oursInc = kind !== 'deletion'
            nextPlacements = updatePlacementBothFlags(nextPlacements, blocksRef.current, block, oursInc, false)
            changedAny = true
          }
        }

        if (!changedAny) return

        const lines: string[] = []
        for (const block of blocksRef.current) {
          const placement = nextPlacements.get(block.blockId)
          if (placement) {
            lines.push(...centerLinesForBlock(block, placement.oursIncluded, placement.theirsIncluded))
          } else {
            lines.push(...(block.baseLines ?? []))
          }
        }
        const mergedText = lines.join('\n')
        const hasTextChange = model.getValue() !== mergedText

        if (hasTextChange) {
          model.pushStackElement()
          isApplyingOwnEditRef.current = true
          centerEditor.executeEdits('merge-bulk-accept-non-conflicting', [{ range: model.getFullModelRange(), text: mergedText }])
          isApplyingOwnEditRef.current = false
          model.pushStackElement()
        }

        const altIdAfter = model.getAlternativeVersionId()
        const textChange = hasTextChange

        historyRef.current.push({
          prePlacements,
          postPlacements: nextPlacements,
          altIdBefore,
          altIdAfter,
          textChange,
        })
        redoRef.current = []
        updatePlacementsStateAndRef(nextPlacements)
        centerEditor.focus()
      })
    }, [executeWithScrollPreservation, updatePlacementsStateAndRef])

    // Reset merge state completely
    const handleResetMerge = useCallback(() => {
      executeWithScrollPreservation(() => {
        const centerEditor = centerEditorRef.current
        const model = centerEditor?.getModel()
        if (!centerEditor || !model) return

        const altIdBefore = model.getAlternativeVersionId()
        const prePlacements = placementsRef.current

        const initialText = computeInitialCenterText(blocksRef.current)
        const initialPlacements = computeInitialPlacements(blocksRef.current)

        const hasTextChange = model.getValue() !== initialText

        if (hasTextChange) {
          model.pushStackElement()
          isApplyingOwnEditRef.current = true
          centerEditor.executeEdits('merge-reset', [{ range: model.getFullModelRange(), text: initialText }])
          isApplyingOwnEditRef.current = false
          model.pushStackElement()
        }

        const altIdAfter = model.getAlternativeVersionId()

        historyRef.current.push({
          prePlacements,
          postPlacements: initialPlacements,
          altIdBefore,
          altIdAfter,
          textChange: hasTextChange,
        })
        redoRef.current = []
        updatePlacementsStateAndRef(initialPlacements)
        centerEditor.focus()
      })
    }, [executeWithScrollPreservation, updatePlacementsStateAndRef])

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
      const theirsEditor = theirsEditorRef.current
      const centerEditor = centerEditorRef.current
      const oursEditor = oursEditorRef.current

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
    }, [isTwoWay])

    useEffect(() => {
      applyScrollOffset()
    }, [leftSegments, rightSegments, applyScrollOffset])

    const connectorRafRef = useRef<number | null>(null)

    const recomputeConnectors = useCallback(() => {
      const theirsEditor = theirsEditorRef.current
      const centerEditor = centerEditorRef.current
      const oursEditor = oursEditorRef.current
      if (!centerEditor || !theirsEditor || (!isTwoWay && !oursEditor)) return

      // Force layout calculation in Monaco to ensure editor structures are initialised
      theirsEditor.layout()
      centerEditor.layout()
      if (oursEditor) oursEditor.layout()

      const lineHeight = monacoRef.current
        ? centerEditor.getOption(monacoRef.current.editor.EditorOption.lineHeight)
        : 19

      const left: ConnectorSegment[] = []
      const right: ConnectorSegment[] = []

      const paneTotals = computePaneTotalLines(blocksRef.current, placementsRef.current)

      if (isTwoWay) {
        for (const block of blocksRef.current) {
          const placement = placementsRef.current.get(block.blockId)
          if (!placement) continue

          if (block.kind === 'unchanged' && collapseUnchanged && !expandedBlocks.has(block.blockId)) {
            const lineCount = block.theirsLineCount
            if (lineCount > 6) {
              const startHide = block.theirsStartLine + 3
              const centerStartHide = placement.centerStartLine + 3

              const theirsY0 = getTop(theirsEditor, startHide - 1, 'theirs') + lineHeight
              const theirsY1 = theirsY0 + 1.5 * lineHeight

              const centerY0 = getTop(centerEditor, centerStartHide - 1, 'center') + lineHeight
              const centerY1 = centerY0 + 1.5 * lineHeight

              left.push({
                id: block.blockId,
                leftY0: theirsY0,
                leftY1: theirsY1,
                rightY0: centerY0,
                rightY1: centerY1,
                colorClass: 'merge-connector-collapsed',
                actionable: false,
                flat: false,
                resolved: false,
                collapsedCount: lineCount - 6,
              })
            }
            continue
          }

          const originalStartLine = block.theirsStartLine
          const originalCount = block.theirsLineCount
          const modifiedStartLine = placement.centerStartLine
          const modifiedCount = placement.centerLineCount

          let kind: 'addition' | 'deletion' | 'modification' = 'modification'
          if (originalCount === 0) kind = 'addition'
          else if (modifiedCount === 0) kind = 'deletion'

          const colorClass = `merge-connector-${kind}`

          let paneY0 = 0
          let paneY1 = 0
          if (originalCount === 0) {
            const afterLine = originalStartLine - 1
            const y = getTop(theirsEditor, afterLine + 1, 'theirs')
            const edge = markerEdge(afterLine, paneTotals.theirs)
            if (edge === 'top') {
              paneY0 = y - 1
              paneY1 = y
            } else {
              paneY0 = y
              paneY1 = y + 1
            }
          } else {
            paneY0 = getTop(theirsEditor, originalStartLine, 'theirs')
            paneY1 = getTop(theirsEditor, originalStartLine + originalCount, 'theirs')
          }

          let centerY0 = 0
          let centerY1 = 0
          if (modifiedCount === 0) {
            const afterLine = modifiedStartLine - 1
            const y = getTop(centerEditor, afterLine + 1, 'center')
            const edge = markerEdge(afterLine, paneTotals.center)
            if (edge === 'top') {
              centerY0 = y - 1
              centerY1 = y
            } else {
              centerY0 = y
              centerY1 = y + 1
            }
          } else {
            centerY0 = getTop(centerEditor, modifiedStartLine, 'center')
            centerY1 = getTop(centerEditor, modifiedStartLine + modifiedCount, 'center')
          }

          const segment: ConnectorSegment = {
            id: block.blockId,
            leftY0: paneY0,
            leftY1: paneY1,
            rightY0: centerY0,
            rightY1: centerY1,
            colorClass,
            actionable: false,
            flat: originalCount === 0 && modifiedCount === 0,
            resolved: false,
          }
          left.push(segment)
        }
      } else {
        for (const block of blocksRef.current) {
          const placement = placementsRef.current.get(block.blockId)
          if (!placement) continue

          if (block.kind === 'unchanged' && collapseUnchanged && !expandedBlocks.has(block.blockId)) {
            const lineCount = block.theirsLineCount
            if (lineCount > 6) {
              const startHide = block.theirsStartLine + 3
              const oursStartHide = block.oursStartLine + 3
              const centerStartHide = placement.centerStartLine + 3

              const theirsY0 = getTop(theirsEditor, startHide - 1, 'theirs') + lineHeight
              const theirsY1 = theirsY0 + 1.5 * lineHeight

              const oursY0 = oursEditor ? getTop(oursEditor, oursStartHide - 1, 'ours') + lineHeight : theirsY0
              const oursY1 = oursY0 + 1.5 * lineHeight

              const centerY0 = getTop(centerEditor, centerStartHide - 1, 'center') + lineHeight
              const centerY1 = centerY0 + 1.5 * lineHeight

              // Left segment (theirs <-> center)
              left.push({
                id: block.blockId,
                leftY0: theirsY0,
                leftY1: theirsY1,
                rightY0: centerY0,
                rightY1: centerY1,
                colorClass: 'merge-connector-collapsed',
                actionable: false,
                flat: false,
                resolved: false,
                collapsedCount: lineCount - 6,
              })

              // Right segment (center <-> ours)
              if (oursEditor) {
                right.push({
                  id: block.blockId,
                  leftY0: centerY0,
                  leftY1: centerY1,
                  rightY0: oursY0,
                  rightY1: oursY1,
                  colorClass: 'merge-connector-collapsed',
                  actionable: false,
                  flat: false,
                  resolved: false,
                  collapsedCount: lineCount - 6,
                })
              }
            }
            continue
          }

          for (const side of ['ours', 'theirs'] as MergeSide[]) {
            const touched = side === 'ours' ? placement.oursTouched : placement.theirsTouched
            const colorClass = connectorClassForSide(block, touched, side)
            if (!colorClass) continue

            const paneEditor = side === 'ours' ? oursEditor : theirsEditor
            if (!paneEditor) continue
            const paneStart = side === 'ours' ? block.oursStartLine : block.theirsStartLine
            const paneCount = side === 'ours' ? block.oursLineCount : block.theirsLineCount
            if (paneCount === 0 && changeKindForBlock(block) === 'addition') continue

            const { start, count } = connectorCenterRangeForSide(placement, block, side)

            let paneY0 = getTop(paneEditor, paneStart, side)
            let paneY1 = getTop(paneEditor, paneStart + paneCount, side)
            if (paneCount === 0) {
              const domNode = typeof paneEditor.getDomNode === 'function' ? paneEditor.getDomNode() : null
              const element = domNode?.querySelector(`[data-zone-id="${block.blockId}-${side}"]`) as HTMLElement | null
              if (element) {
                paneY0 = element.offsetTop
                paneY1 = element.offsetTop + element.offsetHeight
              } else {
                paneY0 = paneY1
                if (changeKindForBlock(block) === 'deletion') {
                  const edge = markerEdge(paneStart - 1, paneTotals[side])
                  if (edge === 'top') {
                    paneY0 = paneY1 - 1
                  } else {
                    paneY0 = paneY1
                    paneY1 = paneY1 + 1
                  }
                }
              }
            }

            let centerY0 = getTop(centerEditor, start, 'center')
            let centerY1 = getTop(centerEditor, start + count, 'center')
            if (count === 0 && changeKindForBlock(block) === 'addition') {
              const edge = markerEdge(start - 1, paneTotals.center)
              if (edge === 'top') {
                centerY0 = centerY1 - 1
              } else {
                centerY0 = centerY1
                centerY1 = centerY1 + 1
              }
            }

            const segment: ConnectorSegment = {
              id: block.blockId,
              // theirs (incoming) sits in the LEFT gap, ours (current) in the RIGHT gap — the
              // pane end of the segment is whichever edge touches that side's own pane.
              leftY0: side === 'theirs' ? paneY0 : centerY0,
              leftY1: side === 'theirs' ? paneY1 : centerY1,
              rightY0: side === 'theirs' ? centerY0 : paneY0,
              rightY1: side === 'theirs' ? centerY1 : paneY1,
              colorClass,
              // `isChangeSource` always returns the authoring side — for a deletion that's the
              // side that deleted (0 lines in its pane). The connector ribbon funnels from the
              // pane's zero-height boundary to the center's still-present base text, and the
              // action buttons anchor at that pane edge.
              actionable: !touched && isChangeSource(block, side),
              // Only truly flat (thin stroked line) when BOTH the pane and the center endpoint
              // are zero-height — e.g. a pending addition's mirror pane. A deletion where the
              // pane has 0 lines but the center still has base content draws as a filled funnel
              // ribbon from the point to the range, not a flat stroke.
              flat: paneCount === 0 && count === 0,
              resolved: touched,
            }
            if (side === 'theirs') left.push(segment)
            else right.push(segment)
          }
        }
      }

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
    }, [isTwoWay, collapseUnchanged, expandedBlocks, getTop])

    const scheduleRecompute = useCallback(() => {
      if (connectorRafRef.current !== null) return
      connectorRafRef.current = requestAnimationFrame(() => {
        connectorRafRef.current = null
        recomputeConnectors()
      })
    }, [recomputeConnectors])

    // handlePaneMount's editorInstance.onDidLayoutChange callback below is registered once at
    // Monaco mount time and never re-subscribed, so it can only ever close over whatever
    // scheduleRecompute (and transitively recomputeConnectors, and expandedBlocks) was at that
    // first render — same problem onEditorMountRef above already exists to solve, just for a
    // different callback. Reading through this ref instead keeps every onDidLayoutChange firing
    // (e.g. a panel resize) using the *current* expandedBlocks instead of silently treating
    // already-expanded blocks as still collapsed.
    const scheduleRecomputeRef = useRef(scheduleRecompute)
    scheduleRecomputeRef.current = scheduleRecompute

    // Apply collapseUnchanged regions to standard Monaco editors using hiddenAreas API and custom view zones
    useEffect(() => {
      const theirsEditor = theirsEditorRef.current
      const centerEditor = centerEditorRef.current
      const oursEditor = oursEditorRef.current

      // Clean up previous view zones
      const clearZones = (editor: editor.IStandaloneCodeEditor | null, zoneIdsRef: React.MutableRefObject<string[]>) => {
        if (editor && zoneIdsRef.current.length > 0) {
          editor.changeViewZones((accessor) => {
            zoneIdsRef.current.forEach((id) => accessor.removeZone(id))
          })
          zoneIdsRef.current = []
        }
      }

      clearZones(theirsEditor, theirsCollapsedViewZonesRef)
      clearZones(centerEditor, centerCollapsedViewZonesRef)
      clearZones(oursEditor, oursCollapsedViewZonesRef)

      if (!collapseUnchanged || !monacoRef.current) {
        if (theirsEditor && typeof (theirsEditor as any).setHiddenAreas === 'function') (theirsEditor as any).setHiddenAreas([])
        if (centerEditor && typeof (centerEditor as any).setHiddenAreas === 'function') (centerEditor as any).setHiddenAreas([])
        if (oursEditor && typeof (oursEditor as any).setHiddenAreas === 'function') (oursEditor as any).setHiddenAreas([])
        scheduleRecompute()
        return
      }

      const monacoInstance = monacoRef.current
      const theirsHidden: any[] = []
      const centerHidden: any[] = []
      const oursHidden: any[] = []

      const theirsZonesToAdd: Array<{ afterLineNumber: number; collapsedCount: number; blockId: number }> = []
      const centerZonesToAdd: Array<{ afterLineNumber: number; collapsedCount: number; blockId: number }> = []
      const oursZonesToAdd: Array<{ afterLineNumber: number; collapsedCount: number; blockId: number }> = []

      viewToUse.blocks.forEach((block) => {
        if (block.kind !== 'unchanged') return
        if (expandedBlocks.has(block.blockId)) return

        // Left pane (theirs)
        if (block.theirsLineCount > 6) {
          const startHide = block.theirsStartLine + 3
          const endHide = block.theirsStartLine + block.theirsLineCount - 4
          theirsHidden.push(new monacoInstance.Range(startHide, 1, endHide, 1))
          theirsZonesToAdd.push({
            afterLineNumber: startHide - 1,
            collapsedCount: endHide - startHide + 1,
            blockId: block.blockId,
          })
        }

        // Right pane (ours)
        if (block.oursLineCount > 6) {
          const startHide = block.oursStartLine + 3
          const endHide = block.oursStartLine + block.oursLineCount - 4
          oursHidden.push(new monacoInstance.Range(startHide, 1, endHide, 1))
          oursZonesToAdd.push({
            afterLineNumber: startHide - 1,
            collapsedCount: endHide - startHide + 1,
            blockId: block.blockId,
          })
        }

        // Center pane (result)
        const p = placements.get(block.blockId)
        if (p && p.centerLineCount > 6) {
          const startHide = p.centerStartLine + 3
          const endHide = p.centerStartLine + p.centerLineCount - 4
          centerHidden.push(new monacoInstance.Range(startHide, 1, endHide, 1))
          centerZonesToAdd.push({
            afterLineNumber: startHide - 1,
            collapsedCount: endHide - startHide + 1,
            blockId: block.blockId,
          })
        }
      })

      if (theirsEditor && typeof (theirsEditor as any).setHiddenAreas === 'function') (theirsEditor as any).setHiddenAreas(theirsHidden)
      if (centerEditor && typeof (centerEditor as any).setHiddenAreas === 'function') (centerEditor as any).setHiddenAreas(centerHidden)
      if (oursEditor && typeof (oursEditor as any).setHiddenAreas === 'function') (oursEditor as any).setHiddenAreas(oursHidden)

      // Create banner DOM nodes and add view zones
      const createBannerNode = (collapsedCount: number, blockId: number, isMargin: boolean) => {
        const domNode = document.createElement('div')
        domNode.className = 'monaco-collapsed-zone-banner'
        domNode.style.pointerEvents = 'auto'
        domNode.setAttribute('data-collapsed-block-id', String(blockId))

        // The margin copy is just the narrow gutter sliver — no room for a label there, so only
        // the full-width main copy gets one. Shown on hover (see .monaco-collapsed-zone-banner-
        // label in styles.css) rather than as a native `title`, which only appears after the
        // browser's own hover delay.
        if (!isMargin) {
          const label = document.createElement('span')
          label.className = 'monaco-collapsed-zone-banner-label'
          label.textContent = `${collapsedCount} lines collapsed`
          domNode.appendChild(label)
        }

        const onTrigger = (e: MouseEvent) => {
          e.stopPropagation()
          e.preventDefault()
          setExpandedBlocks((prev) => {
            const next = new Set(prev)
            next.add(blockId)
            return next
          })
        }

        // Add listeners with capture to handle before Monaco intercepts
        domNode.addEventListener('mousedown', onTrigger, true)
        domNode.addEventListener('click', onTrigger, true)

        // Add hover sync listeners
        domNode.addEventListener('mouseenter', () => setCollapsedBlockHover(blockId, true))
        domNode.addEventListener('mouseleave', () => setCollapsedBlockHover(blockId, false))
        
        return domNode
      }

      if (theirsEditor && theirsZonesToAdd.length > 0) {
        theirsEditor.changeViewZones((accessor) => {
          theirsZonesToAdd.forEach((zone) => {
            const id = accessor.addZone({
              afterLineNumber: zone.afterLineNumber,
              heightInLines: 1.5,
              domNode: createBannerNode(zone.collapsedCount, zone.blockId, false),
              marginDomNode: createBannerNode(zone.collapsedCount, zone.blockId, true),
              showInHiddenAreas: true,
              suppressMouseDown: true,
            })
            theirsCollapsedViewZonesRef.current.push(id)
          })
        })
      }

      if (centerEditor && centerZonesToAdd.length > 0) {
        centerEditor.changeViewZones((accessor) => {
          centerZonesToAdd.forEach((zone) => {
            const id = accessor.addZone({
              afterLineNumber: zone.afterLineNumber,
              heightInLines: 1.5,
              domNode: createBannerNode(zone.collapsedCount, zone.blockId, false),
              marginDomNode: createBannerNode(zone.collapsedCount, zone.blockId, true),
              showInHiddenAreas: true,
              suppressMouseDown: true,
            })
            centerCollapsedViewZonesRef.current.push(id)
          })
        })
      }

      if (oursEditor && oursZonesToAdd.length > 0) {
        oursEditor.changeViewZones((accessor) => {
          oursZonesToAdd.forEach((zone) => {
            const id = accessor.addZone({
              afterLineNumber: zone.afterLineNumber,
              heightInLines: 1.5,
              domNode: createBannerNode(zone.collapsedCount, zone.blockId, false),
              marginDomNode: createBannerNode(zone.collapsedCount, zone.blockId, true),
              showInHiddenAreas: true,
              suppressMouseDown: true,
            })
            oursCollapsedViewZonesRef.current.push(id)
          })
        })
      }

      // Monaco's layout takes a moment to update line height mappings after setHiddenAreas
      scheduleRecompute()
      const t1 = setTimeout(() => scheduleRecompute(), 50)
      const t2 = setTimeout(() => scheduleRecompute(), 150)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearZones(theirsEditorRef.current, theirsCollapsedViewZonesRef)
        clearZones(centerEditorRef.current, centerCollapsedViewZonesRef)
        clearZones(oursEditorRef.current, oursCollapsedViewZonesRef)
      }
    }, [
      collapseUnchanged,
      expandedBlocks,
      viewToUse.blocks,
      placements,
      scheduleRecompute,
      monacoRef.current
    ])

    const handleToggle = useCallback((block: MergeBlock, side: MergeSide, included: boolean) => {
      executeWithScrollPreservation(() => {
        const centerEditor = centerEditorRef.current
        if (!centerEditor) return
        const model = centerEditor.getModel()
        if (!model) return
        const currentPlacement = placementsRef.current.get(block.blockId)
        if (!currentPlacement) return

        const altIdBefore = model.getAlternativeVersionId()
        const prePlacements = placementsRef.current

        const postPlacements = updatePlacementAfterToggle(prePlacements, blocksRef.current, block, side, included)
        const updatedPlacement = postPlacements.get(block.blockId)
        if (!updatedPlacement) return

        const newLines = centerLinesForBlock(block, updatedPlacement.oursIncluded, updatedPlacement.theirsIncluded)
        const hasTextChange = checkTextChanges(model, currentPlacement.centerStartLine, currentPlacement.centerLineCount, newLines)
        const edit = buildRangeEdit(model, currentPlacement.centerStartLine, currentPlacement.centerLineCount, newLines)

        if (hasTextChange) {
          model.pushStackElement()
          isApplyingOwnEditRef.current = true
          centerEditor.executeEdits('merge-gutter-action', [{ range: edit.range, text: edit.text }])
          isApplyingOwnEditRef.current = false
          model.pushStackElement()
        }

        const altIdAfter = model.getAlternativeVersionId()
        const textChange = hasTextChange

        historyRef.current.push({
          prePlacements,
          postPlacements,
          altIdBefore,
          altIdAfter,
          textChange,
        })
        redoRef.current = []
        updatePlacementsStateAndRef(postPlacements)
        centerEditor.focus()
      })
    }, [executeWithScrollPreservation, updatePlacementsStateAndRef])

    // One-sided blocks resolve exclusively, WebStorm-style: their buttons only exist on the
    // side that authored the change (see `isChangeSource`), so accept means "the block becomes
    // exactly this side's content" and ignore means "restore the other side" — which mirrors
    // the untouched ancestor, i.e. puts the base text back. Without the restore, ignoring a
    // one-sided *modification* would just empty the block (its old independent-toggle
    // semantics), leaving no button anywhere to bring the original line back. Both flag flips
    // land in ONE placements update and ONE model edit, so a single Ctrl+Z reverts the whole
    // decision. Genuine conflicts keep the independent per-side toggles (handleToggle) — both
    // gaps are actionable and "keep both" stays possible.
    const applyOneSidedDecision = useCallback((block: MergeBlock, source: MergeSide, apply: boolean) => {
      executeWithScrollPreservation(() => {
        const centerEditor = centerEditorRef.current
        const model = centerEditor?.getModel()
        if (!centerEditor || !model) return
        const current = placementsRef.current.get(block.blockId)
        if (!current) return

        const mirror: MergeSide = source === 'ours' ? 'theirs' : 'ours'
        let next = updatePlacementAfterToggle(placementsRef.current, blocksRef.current, block, source, apply)
        next = updatePlacementAfterToggle(next, blocksRef.current, block, mirror, !apply)
        const flags = next.get(block.blockId)
        if (!flags) return

        const newLines = centerLinesForBlock(block, flags.oursIncluded, flags.theirsIncluded)
        const hasTextChange = checkTextChanges(model, current.centerStartLine, current.centerLineCount, newLines)
        const edit = buildRangeEdit(model, current.centerStartLine, current.centerLineCount, newLines)

        const altIdBefore = model.getAlternativeVersionId()
        const prePlacements = placementsRef.current

        if (hasTextChange) {
          model.pushStackElement()
          isApplyingOwnEditRef.current = true
          centerEditor.executeEdits('merge-gutter-action', [{ range: edit.range, text: edit.text }])
          isApplyingOwnEditRef.current = false
          model.pushStackElement()
        }

        const altIdAfter = model.getAlternativeVersionId()
        const textChange = hasTextChange

        historyRef.current.push({
          prePlacements,
          postPlacements: next,
          altIdBefore,
          altIdAfter,
          textChange,
        })
        redoRef.current = []
        updatePlacementsStateAndRef(next)
        centerEditor.focus()
      })
    }, [executeWithScrollPreservation, updatePlacementsStateAndRef])

    // The connector-gap accept/ignore buttons (MergeConnectorOverlay) only know a block's id,
    // not the `MergeBlock` object itself.
    const handleActionById = useCallback(
      (blockId: number, side: MergeSide, included: boolean) => {
        const block = blocksRef.current.find((b) => b.blockId === blockId)
        if (!block) return
        if (block.kind === 'ours-only' || block.kind === 'theirs-only') {
          applyOneSidedDecision(block, side, included)
        } else {
          handleToggle(block, side, included)
        }
      },
      [handleToggle, applyOneSidedDecision]
    )
    const handleAcceptOurs = useCallback((blockId: number) => handleActionById(blockId, 'ours', true), [handleActionById])
    const handleRejectOurs = useCallback((blockId: number) => handleActionById(blockId, 'ours', false), [handleActionById])
    const handleAcceptTheirs = useCallback((blockId: number) => handleActionById(blockId, 'theirs', true), [handleActionById])
    const handleRejectTheirs = useCallback((blockId: number) => handleActionById(blockId, 'theirs', false), [handleActionById])

    // Re-apply decorations and alignment view zones, and reschedule connector redraw, whenever
    // placements change. The per-pane specs (block colors, hermetic first/last borders, hatched
    // filler zones sized so all three panes stay vertically aligned) all come from
    // computeMergeVisuals — this effect only translates them into Monaco calls.
    useEffect(() => {
      if (!editorsReady) return
      const oursEditor = oursEditorRef.current
      const centerEditor = centerEditorRef.current
      const theirsEditor = theirsEditorRef.current
      if (!centerEditor || !theirsEditor || (!isTwoWay && !oursEditor)) return

      // Update whitespace option in Monaco editors dynamically
      const renderWhitespaceOption = whitespaceMode === 'compare' ? 'all' : 'none'
      if (!isTwoWay && oursEditor && typeof oursEditor.updateOptions === 'function') oursEditor.updateOptions({ renderWhitespace: renderWhitespaceOption })
      if (typeof centerEditor.updateOptions === 'function') centerEditor.updateOptions({ renderWhitespace: renderWhitespaceOption })
      if (typeof theirsEditor.updateOptions === 'function') theirsEditor.updateOptions({ renderWhitespace: renderWhitespaceOption })

      let pendingConflicts = 0
      for (const block of blocksRef.current) {
        const placement = placements.get(block.blockId)
        if (!placement) continue
        if (block.kind === 'both-different' && !placement.oursTouched && !placement.theirsTouched) pendingConflicts += 1
      }

      const visuals = isTwoWay
        ? computeTwoWayVisuals(blocksRef.current, placements, showBlockBorders)
        : computeMergeVisuals(blocksRef.current, placements, showBlockBorders, highlightMode === 'lines')

      // Second diff pass (intra-line): reads the center buffer's live text so the highlights
      // track manual typing too. Only run if highlightMode is 'words'.
      const centerModel = centerEditor.getModel()
      const intra = centerModel && highlightMode === 'words' && !isTwoWay
        ? computeIntraLineHighlights(blocksRef.current, placements, (line) =>
          line >= 1 && line <= centerModel.getLineCount() ? centerModel.getLineContent(line) : ''
        )
        : { ours: [], center: [], theirs: [] }

      const showWholeLineHighlights = true
      if (!isTwoWay && oursDecorationsRef.current) {
        oursDecorationsRef.current.set([
          ...(showWholeLineHighlights ? visuals.ours.decorations.map(toMonacoDecoration) : []),
          ...intra.ours.map(toInlineMonacoDecoration),
        ])
      }
      centerDecorationsRef.current?.set([
        ...(showWholeLineHighlights ? visuals.center.decorations.map(toMonacoDecoration) : []),
        ...(isTwoWay ? [] : intra.center.map(toInlineMonacoDecoration)),
      ])
      theirsDecorationsRef.current?.set([
        ...(showWholeLineHighlights ? visuals.theirs.decorations.map(toMonacoDecoration) : []),
        ...(isTwoWay ? [] : intra.theirs.map(toInlineMonacoDecoration)),
      ])

      if (!isTwoWay && oursEditor) {
        oursZoneIdsRef.current = applyViewZones(oursEditor, oursZoneIdsRef.current, visuals.ours.viewZones)
      }
      centerZoneIdsRef.current = applyViewZones(centerEditor, centerZoneIdsRef.current, visuals.center.viewZones)
      theirsZoneIdsRef.current = applyViewZones(theirsEditor, theirsZoneIdsRef.current, visuals.theirs.viewZones)

      onPendingCountChange?.(pendingConflicts)
      scheduleRecompute()
      updateActiveBlockIndex()

      if (savedScrollTopsRef.current) {
        const { ours, center, theirs } = savedScrollTopsRef.current
        if (!isTwoWay && oursEditor) oursEditor.setScrollTop(ours)
        centerEditor.setScrollTop(center)
        theirsEditor.setScrollTop(theirs)
        savedScrollTopsRef.current = null
        requestAnimationFrame(() => {
          ignoreScrollSyncRef.current = false
        })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placements, editorsReady, showBlockBorders, whitespaceMode, highlightMode, updateActiveBlockIndex, isTwoWay])

    // Track manual edits inside the center pane so downstream block placements (and thus
    // gutter widgets/connectors/colors) stay in sync with what's actually in the buffer, even
    // for free-form typing (including edits that don't change the total line count, or that
    // shift block boundaries in ways a cursor-position heuristic could misattribute). Re-reads
    // the buffer directly via `deriveLivePlacements` rather than guessing at a delta.
    const handleCenterContentChange = useCallback(() => {
      const centerEditor = centerEditorRef.current
      const model = centerEditor?.getModel()
      if (!model) return

      setPlacements((prev) => {
        const next = deriveLivePlacements((line) => model.getLineContent(line), model.getLineCount(), blocksRef.current, prev)
        placementsRef.current = next
        return next
      })
    }, [])

    const triggerUndo = useCallback(() => {
      executeWithScrollPreservation(() => {
        const centerEditor = centerEditorRef.current
        if (!centerEditor) return
        centerEditor.focus()
        const model = centerEditor.getModel()
        if (!model) return

        const currentAltId = model.getAlternativeVersionId()
        const history = historyRef.current
        if (history.length === 0) {
          centerEditor.trigger('keyboard', 'undo', null)
          return
        }

        const entry = history[history.length - 1]
        if (currentAltId !== entry.altIdAfter) {
          // There is manual typing since the gutter action
          centerEditor.trigger('keyboard', 'undo', null)
          return
        }

        if (entry.textChange) {
          isUndoingGutterActionRef.current = true
          centerEditor.trigger('keyboard', 'undo', null)
          isUndoingGutterActionRef.current = false
        } else {
          history.pop()
          updatePlacementsStateAndRef(entry.prePlacements)
          redoRef.current.push(entry)
          scheduleRecompute()
        }
      })
    }, [executeWithScrollPreservation, scheduleRecompute, updatePlacementsStateAndRef])

    const triggerRedo = useCallback(() => {
      executeWithScrollPreservation(() => {
        const centerEditor = centerEditorRef.current
        if (!centerEditor) return
        centerEditor.focus()
        const model = centerEditor.getModel()
        if (!model) return

        const currentAltId = model.getAlternativeVersionId()
        const redo = redoRef.current
        if (redo.length === 0) {
          centerEditor.trigger('keyboard', 'redo', null)
          return
        }

        const entry = redo[redo.length - 1]
        if (currentAltId !== entry.altIdBefore) {
          // There is manual typing/other actions since the undo
          centerEditor.trigger('keyboard', 'redo', null)
          return
        }

        if (entry.textChange) {
          isRedoingGutterActionRef.current = true
          centerEditor.trigger('keyboard', 'redo', null)
          isRedoingGutterActionRef.current = false
        } else {
          redo.pop()
          updatePlacementsStateAndRef(entry.postPlacements)
          historyRef.current.push(entry)
          scheduleRecompute()
        }
      })
    }, [executeWithScrollPreservation, scheduleRecompute, updatePlacementsStateAndRef])

    // Fixes "undo doesn't bring back the gutter buttons/colors": Monaco's own undo/redo stack
    // operates on the model text only, so Ctrl+Z reverts the *content* but, without this,
    // leaves our separate `placements` state (colors, widgets) pointing at whatever the
    // now-undone action set it to. Mirroring Monaco's undo/redo with our own placements
    // history stack keeps the two in lockstep for the common case (undoing/redoing a gutter
    // click or wand application) instead of trying to re-derive state from arbitrary text.
    const handleCenterContentEvent = useCallback(
      (e: editor.IModelContentChangedEvent) => {
        if (isApplyingOwnEditRef.current) return

        const centerEditor = centerEditorRef.current
        const model = centerEditor?.getModel()
        if (!model) return

        const currentAltId = model.getAlternativeVersionId()

        if (e.isUndoing) {
          const history = historyRef.current
          if (history.length > 0) {
            const entry = history[history.length - 1]
            if (isUndoingGutterActionRef.current || (entry.textChange && currentAltId === entry.altIdBefore)) {
              history.pop()
              redoRef.current.push(entry)
              updatePlacementsStateAndRef(entry.prePlacements)
              scheduleRecompute()
              return
            }
          }
          handleCenterContentChange()
          scheduleRecompute()
          return
        }

        if (e.isRedoing) {
          const redo = redoRef.current
          if (redo.length > 0) {
            const entry = redo[redo.length - 1]
            if (isRedoingGutterActionRef.current || (entry.textChange && currentAltId === entry.altIdAfter)) {
              redo.pop()
              historyRef.current.push(entry)
              updatePlacementsStateAndRef(entry.postPlacements)
              scheduleRecompute()
              return
            }
          }
          handleCenterContentChange()
          scheduleRecompute()
          return
        }

        // Genuine manual typing — clears the redo stack (matches normal editor semantics:
        // typing after an undo invalidates redo) and falls back to drift-attribution so
        // widgets/connectors stay roughly aligned.
        redoRef.current = []
        handleCenterContentChange()
        scheduleRecompute()
      },
      [handleCenterContentChange, scheduleRecompute, updatePlacementsStateAndRef]
    )

    // Host mount hook kept in a ref so pane mount callbacks don't re-wire when the host passes
    // a new inline function on every render.
    const onEditorMountRef = useRef(editorConfig?.onEditorMount)
    onEditorMountRef.current = editorConfig?.onEditorMount

    const handlePaneMount = useCallback(
      (pane: 'ours' | 'center' | 'theirs') => (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
        monacoRef.current = monacoInstance
        setMonaco(monacoInstance)
        if (pane === 'ours') oursEditorRef.current = editorInstance
        if (pane === 'center') centerEditorRef.current = editorInstance
        if (pane === 'theirs') theirsEditorRef.current = editorInstance

        if (pane === 'ours') oursDecorationsRef.current = editorInstance.createDecorationsCollection([])
        if (pane === 'center') centerDecorationsRef.current = editorInstance.createDecorationsCollection([])
        if (pane === 'theirs') theirsDecorationsRef.current = editorInstance.createDecorationsCollection([])

        const paneIndex = pane === 'ours' ? 0 : pane === 'center' ? 1 : 2
        attachScrollSync(editorInstance, paneIndex)
        editorInstance.onDidScrollChange(() => {
          applyScrollOffset()
          if (pane === 'center') {
            updateActiveBlockIndex()
          }
        })
        // `onDidLayoutChange` fires when Monaco's own automaticLayout resize-observer settles
        // on this editor's real dimensions — a more reliable connector-recompute trigger than
        // our own outer-container ResizeObserver, since it directly reflects when
        // `getTopForLineNumber` results become trustworthy for *this* editor specifically.
        // Reads through scheduleRecomputeRef, not the closed-over scheduleRecompute directly —
        // this handler is registered once at mount and Monaco never re-subscribes it, so a
        // direct closure would permanently use whatever expandedBlocks existed at mount time.
        editorInstance.onDidLayoutChange(() => scheduleRecomputeRef.current())

        if (pane === 'center') {
          editorInstance.onDidChangeModelContent((e) => handleCenterContentEvent(e))

          // Register undo/redo keybindings to intercept them and handle gutter actions that don't change text
          editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyZ, () => {
            triggerUndo()
          })
          editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyY, () => {
            triggerRedo()
          })
          editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyZ, () => {
            triggerRedo()
          })
        }

        onEditorMountRef.current?.(editorInstance, monacoInstance, pane)

        if (theirsEditorRef.current && centerEditorRef.current && (isTwoWay || oursEditorRef.current)) {
          setEditorsReady(true)
          // Panes normally mount already scrolled to the top, but seed the paths from
          // whatever the panes actually report rather than assuming 0.
          applyScrollOffset()
          updateActiveBlockIndex()
          // Belt-and-suspenders: schedule a couple of follow-up recomputes a moment after all
          // three editors report ready, in case the very first layout pass (and thus the very
          // first `getTopForLineNumber` reads) happened before the browser's first paint.
          setTimeout(() => scheduleRecompute(), 50)
          setTimeout(() => scheduleRecompute(), 250)
        }
      },
      [attachScrollSync, scheduleRecompute, handleCenterContentEvent, applyScrollOffset, updateActiveBlockIndex, triggerUndo, triggerRedo, isTwoWay]
    )

    useEffect(() => {
      const container = containerRef.current
      if (!container) return
      const observer = new ResizeObserver(() => {
        setGapHeight(container.clientHeight)
        scheduleRecompute()
      })
      observer.observe(container)
      return () => observer.disconnect()
    }, [scheduleRecompute])

    // Dragging the pane resize handle (handleLeftMouseDown/handleRightMouseDown) only changes
    // CSS flex-grow ratios via panelWidths — the container's own size never changes, so the
    // ResizeObserver above doesn't fire, and Monaco's automaticLayout isn't enabled anywhere in
    // this codebase, so a pure CSS-driven resize doesn't make Monaco notice on its own either.
    // Without this, connector ribbons/waves (and the collapsed-region hidden areas effect, which
    // also runs off scheduleRecompute) kept using stale pre-resize positions until some
    // unrelated trigger happened to fire.
    useEffect(() => {
      scheduleRecompute()
    }, [panelWidths, scheduleRecompute])

    const applyAutoMerge = useCallback(async () => {
      if (!onAutoMerge) return
      const mergedText = await onAutoMerge()
      const centerEditor = centerEditorRef.current
      const model = centerEditor?.getModel()
      if (!centerEditor || !model) return

      executeWithScrollPreservation(() => {
        const altIdBefore = model.getAlternativeVersionId()
        const prePlacements = placementsRef.current
        const hasTextChange = model.getValue() !== mergedText

        if (hasTextChange) {
          isApplyingOwnEditRef.current = true
          centerEditor.executeEdits('merge-auto-merge', [{ range: model.getFullModelRange(), text: mergedText }])
          isApplyingOwnEditRef.current = false
        }

        const altIdAfter = model.getAlternativeVersionId()
        const textChange = hasTextChange
        const postPlacements = recomputeAllPlacements(blocksRef.current, placementOverridesAfterAutoMerge(blocksRef.current, prePlacements))

        historyRef.current.push({
          prePlacements,
          postPlacements,
          altIdBefore,
          altIdAfter,
          textChange,
        })
        redoRef.current = []
        updatePlacementsStateAndRef(postPlacements)
      })
    }, [onAutoMerge, executeWithScrollPreservation, updatePlacementsStateAndRef])

    useImperativeHandle(
      ref,
      () => ({
        getCenterValue: () => centerEditorRef.current?.getModel()?.getValue() ?? '',
        applyAutoMerge,
        acceptLeft: () => {
          const centerEditor = centerEditorRef.current
          const model = centerEditor?.getModel()
          if (!centerEditor || !model) return

          executeWithScrollPreservation(() => {
            const altIdBefore = model.getAlternativeVersionId()
            const prePlacements = placementsRef.current

            let nextPlacements = new Map(prePlacements)
            for (const block of blocksRef.current) {
              nextPlacements = updatePlacementBothFlags(nextPlacements, blocksRef.current, block, false, true)
            }

            const lines: string[] = []
            for (const block of blocksRef.current) {
              const placement = nextPlacements.get(block.blockId)
              if (placement) {
                lines.push(...centerLinesForBlock(block, placement.oursIncluded, placement.theirsIncluded))
              } else {
                lines.push(...(block.baseLines ?? []))
              }
            }
            const mergedText = lines.join('\n')
            const hasTextChange = model.getValue() !== mergedText

            if (hasTextChange) {
              model.pushStackElement()
              isApplyingOwnEditRef.current = true
              centerEditor.executeEdits('merge-bulk-accept', [{ range: model.getFullModelRange(), text: mergedText }])
              isApplyingOwnEditRef.current = false
              model.pushStackElement()
            }

            const altIdAfter = model.getAlternativeVersionId()
            const textChange = hasTextChange

            historyRef.current.push({
              prePlacements,
              postPlacements: nextPlacements,
              altIdBefore,
              altIdAfter,
              textChange,
            })
            redoRef.current = []
            updatePlacementsStateAndRef(nextPlacements)
            centerEditor.focus()
          })
        },
        acceptRight: () => {
          const centerEditor = centerEditorRef.current
          const model = centerEditor?.getModel()
          if (!centerEditor || !model) return

          executeWithScrollPreservation(() => {
            const altIdBefore = model.getAlternativeVersionId()
            const prePlacements = placementsRef.current

            let nextPlacements = new Map(prePlacements)
            for (const block of blocksRef.current) {
              nextPlacements = updatePlacementBothFlags(nextPlacements, blocksRef.current, block, true, false)
            }

            const lines: string[] = []
            for (const block of blocksRef.current) {
              const placement = nextPlacements.get(block.blockId)
              if (placement) {
                lines.push(...centerLinesForBlock(block, placement.oursIncluded, placement.theirsIncluded))
              } else {
                lines.push(...(block.baseLines ?? []))
              }
            }
            const mergedText = lines.join('\n')
            const hasTextChange = model.getValue() !== mergedText

            if (hasTextChange) {
              model.pushStackElement()
              isApplyingOwnEditRef.current = true
              centerEditor.executeEdits('merge-bulk-accept', [{ range: model.getFullModelRange(), text: mergedText }])
              isApplyingOwnEditRef.current = false
              model.pushStackElement()
            }

            const altIdAfter = model.getAlternativeVersionId()
            const textChange = hasTextChange

            historyRef.current.push({
              prePlacements,
              postPlacements: nextPlacements,
              altIdBefore,
              altIdAfter,
              textChange,
            })
            redoRef.current = []
            updatePlacementsStateAndRef(nextPlacements)
            centerEditor.focus()
          })
        },
        goToNextChange: () => navigateConflict('next'),
        goToPreviousChange: () => navigateConflict('prev'),
      }),
      [executeWithScrollPreservation, updatePlacementsStateAndRef, applyAutoMerge, navigateConflict]
    )

    useEffect(() => {
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
        const isRedo =
          ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')

        if (isUndo) {
          const active = document.activeElement
          const isInputFocused =
            active &&
            (active.tagName === 'INPUT' ||
              active.tagName === 'TEXTAREA' ||
              active.getAttribute('contenteditable') === 'true')

          if (containerRef.current?.contains(active) || !isInputFocused) {
            e.preventDefault()
            e.stopPropagation()
            triggerUndo()
          }
        } else if (isRedo) {
          const active = document.activeElement
          const isInputFocused =
            active &&
            (active.tagName === 'INPUT' ||
              active.tagName === 'TEXTAREA' ||
              active.getAttribute('contenteditable') === 'true')

          if (containerRef.current?.contains(active) || !isInputFocused) {
            e.preventDefault()
            e.stopPropagation()
            triggerRedo()
          }
        }
      }
      window.addEventListener('keydown', handleGlobalKeyDown, true)
      return () => window.removeEventListener('keydown', handleGlobalKeyDown, true)
    }, [triggerUndo, triggerRedo])

    const panes = useMemo(() => {
      if (isTwoWay) {
        return [
          { id: 'theirs' as const, value: original ?? '', readOnly: true, modelPath: `${modelPathPrefix}.original` },
          { id: 'center' as const, value: modified ?? '', readOnly: true, modelPath: `${modelPathPrefix}.modified` },
        ]
      }
      return [
        { id: 'theirs' as const, value: staticView.theirsText, readOnly: true, modelPath: `${modelPathPrefix}#theirs` },
        { id: 'center' as const, value: initialCenterText, readOnly: false, modelPath: `${modelPathPrefix}#center` },
        { id: 'ours' as const, value: staticView.oursText, readOnly: true, modelPath: `${modelPathPrefix}#ours` },
      ]
    }, [isTwoWay, original, modified, modelPathPrefix, staticView, initialCenterText])

    const headerActions: ConflictResolverActionsConfig = typeof header === 'object' ? header : {}

    const currentLineHeight = (monacoRef.current && centerEditorRef.current)
      ? centerEditorRef.current.getOption(monacoRef.current.editor.EditorOption.lineHeight)
      : 19

    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#1a1a1a]">
        {!isTwoWay && header !== false && (
          <ConflictResolverHeader
            actions={headerActions}
            whitespaceMode={whitespaceMode}
            setWhitespaceMode={setWhitespaceMode}
            highlightMode={highlightMode}
            setHighlightMode={setHighlightMode}
            collapseUnchanged={collapseUnchanged}
            setCollapseUnchanged={setCollapseUnchanged}
            onNavigate={navigateConflict}
            canNavigatePrev={activeBlockIndex > 0}
            canNavigateNext={activeBlockIndex !== -1 && activeBlockIndex < changeBlocks.length - 1}
            onApplyLeft={() => applyNonConflicting('left')}
            onApplyRight={() => applyNonConflicting('right')}
            onApplyAll={() => applyNonConflicting('all')}
            onApplyAuto={onAutoMerge ? applyAutoMerge : undefined}
            onReset={handleResetMerge}
            onRecalculate={onRecalculate}
            changesCount={changesCount}
            conflictsCount={conflictsCount}
            statuses={[panelsInput[0]?.status ?? null, panelsInput[1]?.status ?? null, panelsInput[2]?.status ?? null]}
            panelWidths={panelWidths}
            gapWidth={GAP_WIDTH}
          />
        )}
        <div ref={containerRef} className="flex flex-1 w-full overflow-hidden min-h-0">
          {panes.map((pane, index) => (
            <Fragment key={pane.id}>
              <div
                className={`${index === 0 ? 'merge-pane-numbers-right' : ''} min-w-0`}
                style={{ flex: `${panelWidths[index]} 1 0%` }}
                data-testid={`merge-pane-${pane.id}-wrapper`}
              >
                <CodePane
                  value={pane.value}
                  language={editorConfig?.language}
                  theme={editorConfig?.theme}
                  modelPath={pane.modelPath}
                  readOnly={pane.readOnly}
                  onMount={handlePaneMount(pane.id)}
                  editorComponent={editorConfig?.component}
                  loadingFallback={editorConfig?.loadingFallback}
                />
              </div>
              {index < panes.length - 1 && (
                <div
                  className="relative shrink-0 overflow-hidden select-none"
                  style={{
                    width: GAP_WIDTH,
                    cursor: isTwoWay ? 'default' : 'col-resize',
                    backgroundColor: 'var(--vscode-editor-background, #1e1e1e)',
                  }}
                  onMouseDown={isTwoWay ? undefined : (index === 0 ? handleLeftMouseDown : handleRightMouseDown)}
                  data-testid={`merge-resize-handle-${index === 0 ? 'left' : 'right'}`}
                >
                  <MergeConnectorOverlay
                    ref={index === 0 ? leftOverlayRef : rightOverlayRef}
                    width={GAP_WIDTH}
                    height={gapHeight}
                    segments={index === 0 ? leftSegments : rightSegments}
                    side={index === 0 ? 'left' : 'right'}
                    onAccept={index === 0 ? handleAcceptTheirs : handleAcceptOurs}
                    onReject={index === 0 ? handleRejectTheirs : handleRejectOurs}
                    scrollTopLeft={index === 0 ? theirsEditorRef.current?.getScrollTop() ?? 0 : centerEditorRef.current?.getScrollTop() ?? 0}
                    scrollTopRight={index === 0 ? centerEditorRef.current?.getScrollTop() ?? 0 : oursEditorRef.current?.getScrollTop() ?? 0}
                    lineHeight={currentLineHeight}
                    wavePhaseOffset={index === 0 ? gapPhaseOffsets.left : gapPhaseOffsets.right}
                    onExpandBlock={(blockId) => {
                      setExpandedBlocks((prev) => {
                        const next = new Set(prev)
                        next.add(blockId)
                        return next
                      })
                    }}
                  />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    )
  }
)

ConflictResolver.displayName = 'ConflictResolver'
