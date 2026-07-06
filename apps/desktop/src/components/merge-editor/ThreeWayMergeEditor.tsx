import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Monaco } from '@monaco-editor/react'
import type { editor, IRange } from 'monaco-editor'
import type { MergeBlock, ThreeWayMergeView } from '@git-manager/git-types'
import { apiAutoMergeConflictView } from '../../api/conflict.api'
import { MergePane } from './MergePane'
import { MergeConnectorOverlay, type ConnectorSegment } from './MergeConnectorOverlay'
import { useMergeScrollSync } from './useMergeScrollSync'
import {
  type BlockPlacement,
  type MergeSide,
  changeKindForBlock,
  computeInitialCenterText,
  computeInitialPlacements,
  connectorCenterRangeForSide,
  connectorClassForSide,
  deriveLivePlacements,
  isChangeSource,
  linesForSide,
  placementOverridesAfterAutoMerge,
  recomputeAllPlacements,
  subRangeForSide,
  updatePlacementAfterToggle,
} from './mergeBlockLayout'
import {
  type DecorationSpec,
  type ViewZoneSpec,
  computeMergeVisuals,
  computePaneTotalLines,
  markerEdge,
} from './mergeDecorations'
import { type InlineDecorationSpec, computeIntraLineHighlights } from './mergeIntraLineDiff'

interface ThreeWayMergeEditorProps {
  repoPath: string
  filePath: string
  view: ThreeWayMergeView
  onPendingCountChange?: (count: number) => void
  /** Draw the JetBrains-style hermetic 2px top/bottom edges around each block (and the matching
   * closing edges on the hatched filler zones). Off by default — the colored fills alone. */
  showBlockBorders?: boolean
}

export interface ThreeWayMergeEditorRef {
  getCenterValue: () => string
  applyAutoMerge: () => Promise<void>
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

/** JetBrains-style 3-panel merge editor: left = theirs (the incoming change being applied,
 * read-only), center = editable result, right = ours (the local/current side, read-only) —
 * matching WebStorm's merge/rebase dialog, which puts what you're merging IN on the left and
 * your own code on the right. Accept/ignore buttons live in the connector gaps (see
 * MergeConnectorOverlay), anchored against the pane that authored the change; a genuine
 * conflict is actionable from both gaps and its sides toggle independently (accepting ours
 * doesn't exclude theirs, so both can end up in the result together), while a one-sided change
 * is only actionable from its source gap and resolves exclusively — accept swaps the block's
 * center content to that side, ignore restores the other (ancestor-mirroring) side. The magic
 * wand (imperative `applyAutoMerge`) auto-merges every non-conflicting block at once. Blocks
 * are color-coded and connected across the gaps by `MergeConnectorOverlay`. */
export const ThreeWayMergeEditor = forwardRef<ThreeWayMergeEditorRef, ThreeWayMergeEditorProps>(
  ({ repoPath, filePath, view, onPendingCountChange, showBlockBorders = false }, ref) => {
    const blocksRef = useRef<MergeBlock[]>(view.blocks)
    blocksRef.current = view.blocks

    // The center buffer's initial text and its placement metadata are two independent
    // computations over the same blocks — see `computeInitialCenterText`'s own doc comment for
    // why they MUST stay in lockstep (a real, one-time bug: seeding this pane from the backend's
    // plain `oursText` while `computeInitialPlacements` had its own per-block inclusion
    // exceptions left every block after a mismatched one visibly offset by the difference).
    const initialCenterText = useMemo(() => computeInitialCenterText(view.blocks), [view.blocks])
    const [placements, setPlacements] = useState<Map<number, BlockPlacement>>(() => computeInitialPlacements(view.blocks))
    const placementsRef = useRef(placements)
    placementsRef.current = placements

    const [editorsReady, setEditorsReady] = useState(false)
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

    // Reset per-file state when switching to a different file. `placements` is otherwise only
    // ever seeded once (the `useState` lazy initializer above only runs on the component's
    // first mount) — MergePane's `value`/`path` props already make the pane *text* switch to
    // the new file correctly, but without this, decorations/colors and undo history would keep
    // pointing at the *previous* file's blocks. Keyed on repoPath/filePath rather than on `view`
    // itself, since SWR can hand back a freshly-fetched `view` object for the *same* file on
    // revalidation — that shouldn't wipe in-progress edits.
    useEffect(() => {
      setPlacements(computeInitialPlacements(view.blocks))
      historyRef.current = []
      redoRef.current = []
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [repoPath, filePath])

    const { attach: attachScrollSync } = useMergeScrollSync()

    const containerRef = useRef<HTMLDivElement | null>(null)
    const [gapHeight, setGapHeight] = useState(0)
    const [leftSegments, setLeftSegments] = useState<ConnectorSegment[]>([])
    const [rightSegments, setRightSegments] = useState<ConnectorSegment[]>([])
    const leftOverlayRef = useRef<HTMLDivElement | null>(null)
    const rightOverlayRef = useRef<HTMLDivElement | null>(null)

    // Written directly to the DOM (bypassing React state/render) from Monaco's own
    // `onDidScrollChange`, so the connector overlay's position tracks the panes' scroll at the
    // exact same synchronous moment Monaco updates itself, rather than catching up a render
    // cycle later. `recomputeConnectors` below deliberately never factors scroll into segment
    // coordinates (they're in document space) — scroll-following is entirely this transform.
    const applyScrollOffset = useCallback((scrollTop: number) => {
      const transform = `translateY(${-scrollTop}px)`
      if (leftOverlayRef.current) leftOverlayRef.current.style.transform = transform
      if (rightOverlayRef.current) rightOverlayRef.current.style.transform = transform
    }, [])

    const connectorRafRef = useRef<number | null>(null)

    const recomputeConnectors = useCallback(() => {
      const oursEditor = oursEditorRef.current
      const centerEditor = centerEditorRef.current
      const theirsEditor = theirsEditorRef.current
      if (!oursEditor || !centerEditor || !theirsEditor) return


      const left: ConnectorSegment[] = []
      const right: ConnectorSegment[] = []

      // The CENTER's `merge-marker-*` accent line (mergeDecorations.ts) is nudged 1px off the
      // real line it decorates via CSS `transform`, onto the true inter-line boundary — matched
      // below so a segment's center-anchored marker endpoint lands on that exact same shifted
      // pixel instead of drifting 1px away from the line it's supposed to terminate on. Only the
      // CENTER ever gets this treatment: a pane's own zero-line endpoint is always either a pure
      // addition's mirror (skipped entirely, just below) or a deletion/conflict's hachured zone
      // (a real `IViewZone`, never CSS-shifted), so nudging a pane's own Y here would drift it
      // 1px away from geometry that was never moved in the first place.
      const paneTotals = computePaneTotalLines(blocksRef.current, placementsRef.current)

      for (const block of blocksRef.current) {
        const placement = placementsRef.current.get(block.blockId)
        if (!placement) continue

        // Each side's ribbon is independent: it targets wherever that side's content *currently*
        // sits in the center buffer, so excluding one side never hides the other side's own
        // ribbon or button. The center-side anchor comes from `connectorCenterRangeForSide`,
        // not `subRangeForSide` directly: when a side isn't included, it spans whatever the
        // block *does* currently show (the other side's content, which this one would replace)
        // rather than pinching to a point.
        //
        // `flat` is keyed on the PANE's own content alone (`paneCount === 0`), not on whether
        // the center also happens to be empty right now: a side that never has (and never will
        // have) real content for this block — the mirror pane of a one-sided change — draws as
        // a thin flat stroke, continuing that side's boundary marker across the gap, no matter
        // what the *other* side has currently pushed into the center. A side that DOES have its
        // own content (paneCount > 0) always gets the real ribbon/funnel, matching however tall
        // its own pane block is.
        //
        // Exception: a pure ADDITION's mirror pane (the side that never had, and never will
        // have, this content) gets no ribbon at all, not even a flat one — per spec, that pane
        // shows completely untouched, undecorated code, with nothing in its gap either. This is
        // narrower than the deletion case just above: a deletion's "gone" side still gets a flat
        // marker-anchored stroke (there's something to act on — restoring the deleted lines),
        // whereas an addition's mirror side will never have any action available for it at all
        // (see `isChangeSource`, which never routes actionability there for an addition).
        for (const side of ['ours', 'theirs'] as MergeSide[]) {
          const touched = side === 'ours' ? placement.oursTouched : placement.theirsTouched
          const colorClass = connectorClassForSide(block, touched, side)
          if (!colorClass) continue

          const paneEditor = side === 'ours' ? oursEditor : theirsEditor
          const paneStart = side === 'ours' ? block.oursStartLine : block.theirsStartLine
          const paneCount = side === 'ours' ? block.oursLineCount : block.theirsLineCount
          if (paneCount === 0 && changeKindForBlock(block) === 'addition') continue

          const { start, count } = connectorCenterRangeForSide(placement, block, side)

          let paneY0 = paneEditor.getTopForLineNumber(paneStart)
          let paneY1 = paneEditor.getTopForLineNumber(paneStart + paneCount)
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

          let centerY0 = centerEditor.getTopForLineNumber(start)
          let centerY1 = centerEditor.getTopForLineNumber(start + count)
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

      setLeftSegments(left)
      setRightSegments(right)
    }, [])

    const scheduleRecompute = useCallback(() => {
      if (connectorRafRef.current !== null) return
      connectorRafRef.current = requestAnimationFrame(() => {
        connectorRafRef.current = null
        recomputeConnectors()
      })
    }, [recomputeConnectors])

    const handleToggle = useCallback((block: MergeBlock, side: MergeSide, included: boolean) => {
      const centerEditor = centerEditorRef.current
      if (!centerEditor) return
      const model = centerEditor.getModel()
      if (!model) return
      const currentPlacement = placementsRef.current.get(block.blockId)
      if (!currentPlacement) return

      const { start, count } = subRangeForSide(currentPlacement, block, side)
      const newLines = linesForSide(block, side, included)
      const hasTextChange = checkTextChanges(model, start, count, newLines)
      const edit = buildRangeEdit(model, start, count, newLines)

      const altIdBefore = model.getAlternativeVersionId()
      const prePlacements = placementsRef.current

      if (hasTextChange) {
        isApplyingOwnEditRef.current = true
        centerEditor.executeEdits('merge-gutter-action', [{ range: edit.range, text: edit.text }])
        isApplyingOwnEditRef.current = false
      }

      const altIdAfter = model.getAlternativeVersionId()
      const textChange = hasTextChange
      const postPlacements = updatePlacementAfterToggle(prePlacements, blocksRef.current, block, side, included)

      historyRef.current.push({
        prePlacements,
        postPlacements,
        altIdBefore,
        altIdAfter,
        textChange,
      })
      redoRef.current = []
      setPlacements(postPlacements)
    }, [])

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

      const newLines = [
        ...(flags.oursIncluded ? block.oursLines : []),
        ...(flags.theirsIncluded ? block.theirsLines : []),
      ]
      const hasTextChange = checkTextChanges(model, current.centerStartLine, current.centerLineCount, newLines)
      const edit = buildRangeEdit(model, current.centerStartLine, current.centerLineCount, newLines)

      const altIdBefore = model.getAlternativeVersionId()
      const prePlacements = placementsRef.current

      if (hasTextChange) {
        isApplyingOwnEditRef.current = true
        centerEditor.executeEdits('merge-gutter-action', [{ range: edit.range, text: edit.text }])
        isApplyingOwnEditRef.current = false
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
      setPlacements(next)
    }, [])

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
      if (!oursEditor || !centerEditor || !theirsEditor) return

      let pendingConflicts = 0
      for (const block of blocksRef.current) {
        const placement = placements.get(block.blockId)
        if (!placement) continue
        if (block.kind === 'both-different' && !placement.oursTouched && !placement.theirsTouched) pendingConflicts += 1
      }

      const visuals = computeMergeVisuals(blocksRef.current, placements, showBlockBorders)

      // Second diff pass (intra-line): reads the center buffer's live text so the highlights
      // track manual typing too — this effect already re-runs on every content change, since
      // handleCenterContentChange re-derives `placements` from the buffer on each keystroke.
      const centerModel = centerEditor.getModel()
      const intra = centerModel
        ? computeIntraLineHighlights(blocksRef.current, placements, (line) =>
            line >= 1 && line <= centerModel.getLineCount() ? centerModel.getLineContent(line) : ''
          )
        : { ours: [], center: [], theirs: [] }

      oursDecorationsRef.current?.set([
        ...visuals.ours.decorations.map(toMonacoDecoration),
        ...intra.ours.map(toInlineMonacoDecoration),
      ])
      centerDecorationsRef.current?.set([
        ...visuals.center.decorations.map(toMonacoDecoration),
        ...intra.center.map(toInlineMonacoDecoration),
      ])
      theirsDecorationsRef.current?.set([
        ...visuals.theirs.decorations.map(toMonacoDecoration),
        ...intra.theirs.map(toInlineMonacoDecoration),
      ])

      oursZoneIdsRef.current = applyViewZones(oursEditor, oursZoneIdsRef.current, visuals.ours.viewZones)
      centerZoneIdsRef.current = applyViewZones(centerEditor, centerZoneIdsRef.current, visuals.center.viewZones)
      theirsZoneIdsRef.current = applyViewZones(theirsEditor, theirsZoneIdsRef.current, visuals.theirs.viewZones)

      onPendingCountChange?.(pendingConflicts)
      scheduleRecompute()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placements, editorsReady, showBlockBorders])

    // Track manual edits inside the center pane so downstream block placements (and thus
    // gutter widgets/connectors/colors) stay in sync with what's actually in the buffer, even
    // for free-form typing (including edits that don't change the total line count, or that
    // shift block boundaries in ways a cursor-position heuristic could misattribute). Re-reads
    // the buffer directly via `deriveLivePlacements` rather than guessing at a delta.
    const handleCenterContentChange = useCallback(() => {
      const centerEditor = centerEditorRef.current
      const model = centerEditor?.getModel()
      if (!model) return

      setPlacements((prev) =>
        deriveLivePlacements((line) => model.getLineContent(line), model.getLineCount(), blocksRef.current, prev)
      )
    }, [])

    const triggerUndo = useCallback(() => {
      const centerEditor = centerEditorRef.current
      if (!centerEditor) return
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
        centerEditor.trigger('keyboard', 'undo', null)
      } else {
        history.pop()
        setPlacements(entry.prePlacements)
        redoRef.current.push(entry)
        scheduleRecompute()
      }
    }, [scheduleRecompute])

    const triggerRedo = useCallback(() => {
      const centerEditor = centerEditorRef.current
      if (!centerEditor) return
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
        centerEditor.trigger('keyboard', 'redo', null)
      } else {
        redo.pop()
        setPlacements(entry.postPlacements)
        historyRef.current.push(entry)
        scheduleRecompute()
      }
    }, [scheduleRecompute])

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
            if (entry.textChange && currentAltId === entry.altIdBefore) {
              history.pop()
              redoRef.current.push(entry)
              setPlacements(entry.prePlacements)
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
            if (entry.textChange && currentAltId === entry.altIdAfter) {
              redo.pop()
              historyRef.current.push(entry)
              setPlacements(entry.postPlacements)
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
      [handleCenterContentChange, scheduleRecompute]
    )

    const handlePaneMount = useCallback(
      (pane: 'ours' | 'center' | 'theirs') => (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
        monacoRef.current = monacoInstance
        if (pane === 'ours') oursEditorRef.current = editorInstance
        if (pane === 'center') centerEditorRef.current = editorInstance
        if (pane === 'theirs') theirsEditorRef.current = editorInstance

        if (pane === 'ours') oursDecorationsRef.current = editorInstance.createDecorationsCollection([])
        if (pane === 'center') centerDecorationsRef.current = editorInstance.createDecorationsCollection([])
        if (pane === 'theirs') theirsDecorationsRef.current = editorInstance.createDecorationsCollection([])

        const paneIndex = pane === 'ours' ? 0 : pane === 'center' ? 1 : 2
        attachScrollSync(editorInstance, paneIndex)
        editorInstance.onDidScrollChange((e) => applyScrollOffset(e.scrollTop))
        // `onDidLayoutChange` fires when Monaco's own automaticLayout resize-observer settles
        // on this editor's real dimensions — a more reliable connector-recompute trigger than
        // our own outer-container ResizeObserver, since it directly reflects when
        // `getTopForLineNumber` results become trustworthy for *this* editor specifically.
        editorInstance.onDidLayoutChange(() => scheduleRecompute())

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

        if (oursEditorRef.current && centerEditorRef.current && theirsEditorRef.current) {
          setEditorsReady(true)
          // Panes normally mount already scrolled to the top, but seed the transform from
          // whatever the center pane actually reports rather than assuming 0.
          applyScrollOffset(centerEditorRef.current.getScrollTop())
          // Belt-and-suspenders: schedule a couple of follow-up recomputes a moment after all
          // three editors report ready, in case the very first layout pass (and thus the very
          // first `getTopForLineNumber` reads) happened before the browser's first paint.
          setTimeout(() => scheduleRecompute(), 50)
          setTimeout(() => scheduleRecompute(), 250)
        }
      },
      [attachScrollSync, scheduleRecompute, handleCenterContentEvent, applyScrollOffset]
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

    useImperativeHandle(
      ref,
      () => ({
        getCenterValue: () => centerEditorRef.current?.getModel()?.getValue() ?? '',
        applyAutoMerge: async () => {
          const mergedText = await apiAutoMergeConflictView(repoPath, filePath)
          const centerEditor = centerEditorRef.current
          const model = centerEditor?.getModel()
          if (!centerEditor || !model) return

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
          setPlacements(postPlacements)
        },
      }),
      [repoPath, filePath]
    )

    useEffect(() => {
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
        const isRedo =
          ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')

        if (isUndo) {
          if (containerRef.current?.contains(document.activeElement)) {
            e.preventDefault()
            e.stopPropagation()
            triggerUndo()
          }
        } else if (isRedo) {
          if (containerRef.current?.contains(document.activeElement)) {
            e.preventDefault()
            e.stopPropagation()
            triggerRedo()
          }
        }
      }
      window.addEventListener('keydown', handleGlobalKeyDown, true)
      return () => window.removeEventListener('keydown', handleGlobalKeyDown, true)
    }, [triggerUndo, triggerRedo])

    return (
      <div ref={containerRef} className="flex h-full w-full overflow-hidden">
        <div className="merge-pane-numbers-right min-w-0 flex-1">
          <MergePane
            value={view.theirsText}
            filePath={filePath}
            modelPath={`${repoPath}/${filePath}#theirs`}
            readOnly
            onMount={handlePaneMount('theirs')}
          />
        </div>
        <div className="relative shrink-0 overflow-hidden" style={{ width: GAP_WIDTH }}>
          <MergeConnectorOverlay
            ref={leftOverlayRef}
            width={GAP_WIDTH}
            height={gapHeight}
            segments={leftSegments}
            side="left"
            onAccept={handleAcceptTheirs}
            onReject={handleRejectTheirs}
          />
        </div>
        <div className="min-w-0 flex-1">
          <MergePane
            value={initialCenterText}
            filePath={filePath}
            modelPath={`${repoPath}/${filePath}#center`}
            readOnly={false}
            onMount={handlePaneMount('center')}
          />
        </div>
        <div className="relative shrink-0 overflow-hidden" style={{ width: GAP_WIDTH }}>
          <MergeConnectorOverlay
            ref={rightOverlayRef}
            width={GAP_WIDTH}
            height={gapHeight}
            segments={rightSegments}
            side="right"
            onAccept={handleAcceptOurs}
            onReject={handleRejectOurs}
          />
        </div>
        <div className="min-w-0 flex-1">
          <MergePane
            value={view.oursText}
            filePath={filePath}
            modelPath={`${repoPath}/${filePath}#ours`}
            readOnly
            onMount={handlePaneMount('ours')}
          />
        </div>
      </div>
    )
  }
)

ThreeWayMergeEditor.displayName = 'ThreeWayMergeEditor'
