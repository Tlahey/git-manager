import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
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
  computeInitialPlacements,
  connectorCenterRangeForSide,
  connectorClassForSide,
  deriveLivePlacements,
  linesForSide,
  placementOverridesAfterAutoMerge,
  recomputeAllPlacements,
  sideColorClass,
  sideTextColorClass,
  subRangeForSide,
  updatePlacementAfterToggle,
} from './mergeBlockLayout'

interface ThreeWayMergeEditorProps {
  repoPath: string
  filePath: string
  view: ThreeWayMergeView
  onPendingCountChange?: (count: number) => void
}

export interface ThreeWayMergeEditorRef {
  getCenterValue: () => string
  applyAutoMerge: () => Promise<void>
}

// Wide enough to comfortably fit the two accept/ignore buttons side by side (see
// MergeConnectorOverlay) plus the ribbon curve.
const GAP_WIDTH = 40

/** `endLineExclusive` is `startLine + lineCount` (one past the range's last line) — the same
 * convention used for edit ranges. For a *decoration* though, `isWholeLine: true` treats
 * `endLineNumber` as inclusive regardless of `endColumn`, so passing the exclusive boundary
 * straight through would bleed the color one line into whatever follows the range.
 *
 * `textClassName`/`marginClassName` are deliberately different classes (muted vs. vivid — see
 * `sideTextColorClass`/`sideColorClass` in mergeBlockLayout.ts): a heavy fill behind actual code
 * text fights with legibility, but the same intensity in the gutter/line-number margin (no text
 * to compete with) reads better vivid. `lineNumberClassName` turned out to only color the
 * line-number digit's own narrow div, not the full gutter row — `marginClassName` is the one
 * that paints the whole margin width (line numbers + the reserved lineDecorationsWidth strip
 * together). */
function lineDecoration(
  startLine: number,
  endLineExclusive: number,
  textClassName: string,
  marginClassName: string
): editor.IModelDeltaDecoration {
  const lastLine = Math.max(startLine, endLineExclusive - 1)
  const range: IRange = { startLineNumber: startLine, startColumn: 1, endLineNumber: lastLine, endColumn: 1 }
  // `zIndex` is defensive: without it, decorations can render underneath other decoration
  // layers Monaco itself manages (current-line highlight, etc.) depending on paint order.
  return { range, options: { isWholeLine: true, className: textClassName, marginClassName, zIndex: 10 } }
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

/** JetBrains-style 3-panel merge editor: left = ours (read-only), center = editable result,
 * right = theirs (read-only). Each side of a block can be independently included in the center
 * — accepting ours doesn't exclude theirs, so both can end up in the final result together.
 * Accept/ignore buttons live in the connector gaps (see MergeConnectorOverlay), not in either
 * pane's own gutter; the magic wand (imperative `applyAutoMerge`) auto-merges every
 * non-conflicting block at once. Blocks are color-coded and connected across the gaps by
 * `MergeConnectorOverlay`. */
export const ThreeWayMergeEditor = forwardRef<ThreeWayMergeEditorRef, ThreeWayMergeEditorProps>(
  ({ repoPath, filePath, view, onPendingCountChange }, ref) => {
    const blocksRef = useRef<MergeBlock[]>(view.blocks)
    blocksRef.current = view.blocks

    // The center buffer always starts as plain, natural text — exactly `oursText` (every
    // block's `ours_lines` concatenated), never conflict-marker syntax.
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

    // Undo/redo-aware bookkeeping: every gutter/wand action snapshots the placements map it's
    // about to replace onto `historyRef` and clears `redoRef` (new branch of history, matching
    // normal editor semantics). `isApplyingOwnEditRef` is set for the duration of our own
    // `executeEdits` calls so the center pane's content-change listener (below) can tell "we
    // just made this edit ourselves" apart from a genuine undo/redo/manual keystroke — without
    // this, Ctrl+Z would change the buffer text back but leave gutter widgets/colors stuck on
    // whatever they were set to by the action being undone.
    const historyRef = useRef<Map<number, BlockPlacement>[]>([])
    const redoRef = useRef<Map<number, BlockPlacement>[]>([])
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

      for (const block of blocksRef.current) {
        const placement = placementsRef.current.get(block.blockId)
        if (!placement) continue

        // Each side's ribbon is independent: it targets wherever that side's content *currently*
        // sits in the center buffer, so excluding one side never hides the other side's own
        // ribbon or button (previously, rejecting a block emptied its whole center range, which
        // made both ribbons vanish together even though only one side was actually acted on).
        // The center-side anchor comes from `connectorCenterRangeForSide`, not `subRangeForSide`
        // directly: when a side isn't included, it spans whatever the block *does* currently
        // show (the other side's content, which this one would replace) rather than pinching to
        // a point — a point there would make a modification/conflict look shaped exactly like a
        // pure addition. It only genuinely collapses to a point when the block has nothing
        // shown at all (a pure addition that hasn't been pulled in yet).
        if (block.oursLineCount > 0) {
          const leftColor = connectorClassForSide(block, placement.oursTouched, 'ours')
          if (leftColor) {
            const { start, count } = connectorCenterRangeForSide(placement, block, 'ours')
            const centerY0 = centerEditor.getTopForLineNumber(start)
            const centerY1 = centerEditor.getTopForLineNumber(start + count)
            const oursY0 = oursEditor.getTopForLineNumber(block.oursStartLine)
            const oursY1 = oursEditor.getTopForLineNumber(block.oursStartLine + block.oursLineCount)
            left.push({
              id: block.blockId,
              leftY0: oursY0,
              leftY1: oursY1,
              rightY0: centerY0,
              rightY1: centerY1,
              colorClass: leftColor,
              actionable: !placement.oursTouched,
            })
          }
        }
        if (block.theirsLineCount > 0) {
          const rightColor = connectorClassForSide(block, placement.theirsTouched, 'theirs')
          if (rightColor) {
            const { start, count } = connectorCenterRangeForSide(placement, block, 'theirs')
            const centerY0 = centerEditor.getTopForLineNumber(start)
            const centerY1 = centerEditor.getTopForLineNumber(start + count)
            const theirsY0 = theirsEditor.getTopForLineNumber(block.theirsStartLine)
            const theirsY1 = theirsEditor.getTopForLineNumber(block.theirsStartLine + block.theirsLineCount)
            right.push({
              id: block.blockId,
              leftY0: centerY0,
              leftY1: centerY1,
              rightY0: theirsY0,
              rightY1: theirsY1,
              colorClass: rightColor,
              actionable: !placement.theirsTouched,
            })
          }
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
      const edit = buildRangeEdit(model, start, count, newLines)

      isApplyingOwnEditRef.current = true
      centerEditor.executeEdits('merge-gutter-action', [{ range: edit.range, text: edit.text }])
      isApplyingOwnEditRef.current = false

      historyRef.current.push(placementsRef.current)
      redoRef.current = []
      setPlacements(updatePlacementAfterToggle(placementsRef.current, blocksRef.current, block, side, included))
    }, [])

    // The connector-gap accept/ignore buttons (MergeConnectorOverlay) only know a block's id,
    // not the `MergeBlock` object itself.
    const handleToggleById = useCallback(
      (blockId: number, side: MergeSide, included: boolean) => {
        const block = blocksRef.current.find((b) => b.blockId === blockId)
        if (block) handleToggle(block, side, included)
      },
      [handleToggle]
    )
    const handleAcceptOurs = useCallback((blockId: number) => handleToggleById(blockId, 'ours', true), [handleToggleById])
    const handleRejectOurs = useCallback((blockId: number) => handleToggleById(blockId, 'ours', false), [handleToggleById])
    const handleAcceptTheirs = useCallback((blockId: number) => handleToggleById(blockId, 'theirs', true), [handleToggleById])
    const handleRejectTheirs = useCallback((blockId: number) => handleToggleById(blockId, 'theirs', false), [handleToggleById])

    // Re-apply decorations and reschedule connector redraw whenever placements change.
    useEffect(() => {
      if (!editorsReady) return
      const oursEditor = oursEditorRef.current
      const centerEditor = centerEditorRef.current
      const theirsEditor = theirsEditorRef.current
      if (!oursEditor || !centerEditor || !theirsEditor) return

      const oursDecorations: editor.IModelDeltaDecoration[] = []
      const centerDecorations: editor.IModelDeltaDecoration[] = []
      const theirsDecorations: editor.IModelDeltaDecoration[] = []

      let pendingConflicts = 0

      for (const block of blocksRef.current) {
        const placement = placements.get(block.blockId)
        if (!placement) continue
        if (block.kind === 'both-different' && !placement.oursTouched && !placement.theirsTouched) pendingConflicts += 1

        const oursMarginColor = sideColorClass(block, placement.oursTouched, 'ours')
        const oursTextColor = sideTextColorClass(block, placement.oursTouched, 'ours')
        if (oursMarginColor && oursTextColor && block.oursLineCount > 0) {
          oursDecorations.push(
            lineDecoration(block.oursStartLine, block.oursStartLine + block.oursLineCount, oursTextColor, oursMarginColor)
          )
        }
        const theirsMarginColor = sideColorClass(block, placement.theirsTouched, 'theirs')
        const theirsTextColor = sideTextColorClass(block, placement.theirsTouched, 'theirs')
        if (theirsMarginColor && theirsTextColor && block.theirsLineCount > 0) {
          theirsDecorations.push(
            lineDecoration(block.theirsStartLine, block.theirsStartLine + block.theirsLineCount, theirsTextColor, theirsMarginColor)
          )
        }

        // Center: up to two separate colored sub-ranges (ours-derived lines, then theirs-derived
        // lines, in that fixed order) since both sides can now be present simultaneously.
        if (placement.oursIncluded) {
          const { start, count } = subRangeForSide(placement, block, 'ours')
          if (count > 0 && oursMarginColor && oursTextColor) {
            centerDecorations.push(lineDecoration(start, start + count, oursTextColor, oursMarginColor))
          }
        }
        if (placement.theirsIncluded) {
          const { start, count } = subRangeForSide(placement, block, 'theirs')
          if (count > 0 && theirsMarginColor && theirsTextColor) {
            centerDecorations.push(lineDecoration(start, start + count, theirsTextColor, theirsMarginColor))
          }
        }
      }

      oursDecorationsRef.current?.set(oursDecorations)
      centerDecorationsRef.current?.set(centerDecorations)
      theirsDecorationsRef.current?.set(theirsDecorations)

      onPendingCountChange?.(pendingConflicts)
      scheduleRecompute()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placements, editorsReady])

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

    // Fixes "undo doesn't bring back the gutter buttons/colors": Monaco's own undo/redo stack
    // operates on the model text only, so Ctrl+Z reverts the *content* but, without this,
    // leaves our separate `placements` state (colors, widgets) pointing at whatever the
    // now-undone action set it to. Mirroring Monaco's undo/redo with our own placements
    // history stack keeps the two in lockstep for the common case (undoing/redoing a gutter
    // click or wand application) instead of trying to re-derive state from arbitrary text.
    const handleCenterContentEvent = useCallback(
      (e: editor.IModelContentChangedEvent) => {
        if (isApplyingOwnEditRef.current) return

        if (e.isUndoing) {
          const previous = historyRef.current.pop()
          if (previous) {
            redoRef.current.push(placementsRef.current)
            setPlacements(previous)
          }
          scheduleRecompute()
          return
        }
        if (e.isRedoing) {
          const next = redoRef.current.pop()
          if (next) {
            historyRef.current.push(placementsRef.current)
            setPlacements(next)
          }
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
          if (centerEditor && model) {
            isApplyingOwnEditRef.current = true
            centerEditor.executeEdits('merge-auto-merge', [{ range: model.getFullModelRange(), text: mergedText }])
            isApplyingOwnEditRef.current = false
          }
          historyRef.current.push(placementsRef.current)
          redoRef.current = []
          setPlacements(recomputeAllPlacements(blocksRef.current, placementOverridesAfterAutoMerge(blocksRef.current, placementsRef.current)))
        },
      }),
      [repoPath, filePath]
    )

    return (
      <div ref={containerRef} className="flex h-full w-full overflow-hidden">
        <div className="merge-pane-numbers-right min-w-0 flex-1">
          <MergePane
            value={view.oursText}
            filePath={filePath}
            modelPath={`${repoPath}/${filePath}#ours`}
            readOnly
            onMount={handlePaneMount('ours')}
          />
        </div>
        <div className="relative shrink-0 overflow-hidden" style={{ width: GAP_WIDTH }}>
          <MergeConnectorOverlay
            ref={leftOverlayRef}
            width={GAP_WIDTH}
            height={gapHeight}
            segments={leftSegments}
            side="left"
            onAccept={handleAcceptOurs}
            onReject={handleRejectOurs}
          />
        </div>
        <div className="min-w-0 flex-1">
          <MergePane
            value={view.oursText}
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
            onAccept={handleAcceptTheirs}
            onReject={handleRejectTheirs}
          />
        </div>
        <div className="min-w-0 flex-1">
          <MergePane
            value={view.theirsText}
            filePath={filePath}
            modelPath={`${repoPath}/${filePath}#theirs`}
            readOnly
            onMount={handlePaneMount('theirs')}
          />
        </div>
      </div>
    )
  }
)

ThreeWayMergeEditor.displayName = 'ThreeWayMergeEditor'
