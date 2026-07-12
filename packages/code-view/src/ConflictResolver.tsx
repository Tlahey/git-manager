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
import type { editor } from 'monaco-editor'
import type { MergeBlock } from './types'
import {
  ConflictResolverHeader,
  type ConflictResolverActionsConfig,
} from './ConflictResolverHeader'
import { CodePane, type CodePaneEditorComponent } from './CodePane'
import { MergeConnectorOverlay } from './MergeConnectorOverlay'
import { useMergeScrollSync } from './useMergeScrollSync'
import {
  type BlockPlacement,
  computeInitialCenterText,
  computeInitialPlacements,
  deriveLivePlacements,
} from './mergeBlockLayout'
import { computeMergeVisuals } from './mergeDecorations'
import { DEFAULT_LINE_HEIGHT, GAP_WIDTH } from './mergeViewConfig'
import { computeTwoWayVisuals, type InternalMergeView } from './conflict-resolver/twoWayView'
import {
  type PaneSide,
  collapsedRegionsForPane,
  toBannerZones,
  toHiddenRanges,
} from './conflict-resolver/collapsedRegions'
import { getTopForLineNumberSafe } from './conflict-resolver/editorGeometry'
import { useMergeEditorRefs } from './conflict-resolver/hooks/useMergeEditorRefs'
import { useScrollPreservation } from './conflict-resolver/hooks/useScrollPreservation'
import { usePanelResize } from './conflict-resolver/hooks/usePanelResize'
import { useTwoWayDiffView } from './conflict-resolver/hooks/useTwoWayDiffView'
import { useCollapseUnchanged } from './conflict-resolver/hooks/useCollapseUnchanged'
import { useMergeConnectors } from './conflict-resolver/hooks/useMergeConnectors'
import { useMergeHistory } from './conflict-resolver/hooks/useMergeHistory'
import { useMergeActions } from './conflict-resolver/hooks/useMergeActions'
import { useConflictNavigation } from './conflict-resolver/hooks/useConflictNavigation'
import { useMergeDecorations } from './conflict-resolver/hooks/useMergeDecorations'

/** One entry per pane, in visual order. 2 panels = side-by-side diff (original | modified),
 * read-only, block geometry computed live by Monaco's own diff engine. 3 panels = full merge
 * view (incoming | result | current) driven by `blocks`; the middle panel's initial content is
 * always derived from `blocks` (its `content` is ignored). */
export interface ConflictResolverPanel {
  /** Pane text. Ignored for the middle panel in 3-panel mode (derived from `blocks`). */
  content?: string
  /** Node rendered above this pane in the header's status bar. */
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
   * (see ConflictResolverActionsConfig). In 2-panel (`isTwoWay`) mode, the merge-only actions
   * (apply-non-conflicting, auto-merge, reset) are always forced off regardless of this config —
   * there's no merge target to write into, just two read-only panes. */
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
  /** Initial collapse-unchanged state — the header's own toggle button controls it from there. */
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
 * geometry is computed live by Monaco's own diff engine.
 *
 * This file is the orchestrator: state ownership, pane mounting, and JSX. The behavior lives in
 * the focused modules under `conflict-resolver/` (pure geometry/text helpers) and
 * `conflict-resolver/hooks/` (resize, scroll preservation, 2-way diff, collapse, connectors,
 * undo/redo history, merge actions, navigation, decorations). */
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
    const [whitespaceMode, setWhitespaceMode] = useState<'compare' | 'ignore' | 'trim'>('compare')
    const [highlightMode, setHighlightMode] = useState<'words' | 'lines'>('words')
    const [editorsReady, setEditorsReady] = useState(false)

    const dummyView = useMemo<InternalMergeView>(
      () => ({ blocks: [], oursText: '', theirsText: '' }),
      []
    )

    const staticView = useMemo<InternalMergeView>(
      () => ({
        blocks: blocks ?? [],
        oursText: panelsInput[2]?.content ?? '',
        theirsText: panelsInput[0]?.content ?? '',
      }),
      [blocks, panelsInput]
    )

    // Compute diff dynamically in 2-way mode
    const dynamicView = useTwoWayDiffView(isTwoWay, monaco, original, modified, whitespaceMode)
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

    const editors = useMergeEditorRefs()
    const { ignoreScrollSyncRef, executeWithScrollPreservation, restoreSavedScrollTops } =
      useScrollPreservation(editors)

    // useCollapseUnchanged needs to schedule connector recomputes, but useMergeConnectors in
    // turn needs the collapse state — this stable indirection breaks the cycle: the collapse
    // hook gets a never-changing callback that reads whatever the connectors hook's current
    // scheduleRecompute is (assigned right after that hook runs, below).
    const scheduleRecomputeIndirectionRef = useRef<() => void>(() => {})
    const stableScheduleRecompute = useCallback(() => scheduleRecomputeIndirectionRef.current(), [])

    const { collapseUnchanged, setCollapseUnchanged, expandedBlocks, expandBlock } =
      useCollapseUnchanged({
        editors,
        blocks: viewToUse.blocks,
        placements,
        scheduleRecompute: stableScheduleRecompute,
        defaultCollapseUnchanged,
        editorsReady,
      })

    /** A line's top Y offset in a pane's content space, accounting for collapsed (hidden)
     * regions and every alignment/banner view zone above it — the shared geometry basis for
     * scroll sync and connector ribbons. */
    const getTop = useCallback(
      (paneEditor: editor.IStandaloneCodeEditor, lineNumber: number, side: PaneSide): number => {
        const lineHeight =
          editors.monacoRef.current && editors.centerEditorRef.current
            ? editors.centerEditorRef.current.getOption(
                editors.monacoRef.current.editor.EditorOption.lineHeight
              )
            : DEFAULT_LINE_HEIGHT

        const collapsedRegions = collapseUnchanged
          ? collapsedRegionsForPane(blocksRef.current, placementsRef.current, expandedBlocks, side)
          : []

        const visuals = isTwoWay
          ? computeTwoWayVisuals(blocksRef.current, placementsRef.current, showBlockBorders)
          : computeMergeVisuals(
              blocksRef.current,
              placementsRef.current,
              showBlockBorders,
              highlightMode === 'lines'
            )

        // In 2-way mode the `ours` pane doesn't exist — its visuals slot is always empty.
        const paneVisualZones = isTwoWay && side === 'ours' ? [] : visuals[side].viewZones
        const viewZones = [
          ...toBannerZones(collapsedRegions),
          ...paneVisualZones.map((vz) => ({
            afterLineNumber: vz.afterLineNumber,
            heightInLines: vz.heightInLines,
          })),
        ]

        return getTopForLineNumberSafe(
          paneEditor,
          lineNumber,
          lineHeight,
          toHiddenRanges(collapsedRegions),
          viewZones
        )
      },
      [editors, isTwoWay, collapseUnchanged, expandedBlocks, highlightMode, showBlockBorders]
    )

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

    const { panelWidths, resetPanelWidths, handleLeftMouseDown, handleRightMouseDown } =
      usePanelResize(containerRef, isTwoWay)

    const {
      gapHeight,
      leftSegments,
      rightSegments,
      leftOverlayRef,
      rightOverlayRef,
      gapPhaseOffsets,
      applyScrollOffset,
      scheduleRecompute,
      scheduleRecomputeRef,
    } = useMergeConnectors({
      containerRef,
      editors,
      blocksRef,
      placementsRef,
      getTop,
      isTwoWay,
      collapseUnchanged,
      expandedBlocks,
      panelWidths,
    })
    scheduleRecomputeIndirectionRef.current = scheduleRecompute

    // Track manual edits inside the center pane so downstream block placements (and thus
    // gutter widgets/connectors/colors) stay in sync with what's actually in the buffer, even
    // for free-form typing (including edits that don't change the total line count, or that
    // shift block boundaries in ways a cursor-position heuristic could misattribute). Re-reads
    // the buffer directly via `deriveLivePlacements` rather than guessing at a delta.
    const syncPlacementsFromBuffer = useCallback(() => {
      const model = editors.centerEditorRef.current?.getModel()
      if (!model) return

      setPlacements((prev) => {
        const next = deriveLivePlacements(
          (line) => model.getLineContent(line),
          model.getLineCount(),
          blocksRef.current,
          prev
        )
        placementsRef.current = next
        return next
      })
    }, [editors])

    const {
      recordEntry,
      resetHistory,
      applyTrackedEdit,
      triggerUndo,
      triggerRedo,
      handleCenterContentEvent,
    } = useMergeHistory({
      editors,
      containerRef,
      executeWithScrollPreservation,
      scheduleRecompute,
      updatePlacementsStateAndRef,
      syncPlacementsFromBuffer,
    })

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
      resetHistory()
      resetPanelWidths()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelPathPrefix, updatePlacementsStateAndRef, isTwoWay, resetHistory, resetPanelWidths])

    const { attach: attachScrollSync } = useMergeScrollSync(
      blocksRef,
      placementsRef,
      editors.monacoRef,
      getTop,
      ignoreScrollSyncRef
    )

    const { activeBlockIndex, changeBlocks, updateActiveBlockIndex, navigateConflict } =
      useConflictNavigation(viewToUse.blocks, placementsRef, editors)

    const {
      handleActionById,
      applyNonConflicting,
      acceptAllForSide,
      handleResetMerge,
      applyAutoMerge,
    } = useMergeActions({
      editors,
      blocksRef,
      placementsRef,
      updatePlacementsStateAndRef,
      executeWithScrollPreservation,
      recordEntry,
      applyTrackedEdit,
      onAutoMerge,
    })

    const handleAcceptOurs = useCallback(
      (blockId: number) => handleActionById(blockId, 'ours', true),
      [handleActionById]
    )
    const handleRejectOurs = useCallback(
      (blockId: number) => handleActionById(blockId, 'ours', false),
      [handleActionById]
    )
    const handleAcceptTheirs = useCallback(
      (blockId: number) => handleActionById(blockId, 'theirs', true),
      [handleActionById]
    )
    const handleRejectTheirs = useCallback(
      (blockId: number) => handleActionById(blockId, 'theirs', false),
      [handleActionById]
    )

    useMergeDecorations({
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
    })

    // Host mount hook kept in a ref so pane mount callbacks don't re-wire when the host passes
    // a new inline function on every render.
    const onEditorMountRef = useRef(editorConfig?.onEditorMount)
    onEditorMountRef.current = editorConfig?.onEditorMount

    const handlePaneMount = useCallback(
      (pane: 'ours' | 'center' | 'theirs') =>
        (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
          editors.monacoRef.current = monacoInstance
          setMonaco(monacoInstance)
          if (pane === 'ours') editors.oursEditorRef.current = editorInstance
          if (pane === 'center') editors.centerEditorRef.current = editorInstance
          if (pane === 'theirs') editors.theirsEditorRef.current = editorInstance

          if (pane === 'ours')
            editors.oursDecorationsRef.current = editorInstance.createDecorationsCollection([])
          if (pane === 'center')
            editors.centerDecorationsRef.current = editorInstance.createDecorationsCollection([])
          if (pane === 'theirs')
            editors.theirsDecorationsRef.current = editorInstance.createDecorationsCollection([])

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
            editorInstance.addCommand(
              monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyZ,
              () => {
                triggerUndo()
              }
            )
            editorInstance.addCommand(
              monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyY,
              () => {
                triggerRedo()
              }
            )
            editorInstance.addCommand(
              monacoInstance.KeyMod.CtrlCmd |
                monacoInstance.KeyMod.Shift |
                monacoInstance.KeyCode.KeyZ,
              () => {
                triggerRedo()
              }
            )
          }

          onEditorMountRef.current?.(editorInstance, monacoInstance, pane)

          if (
            editors.theirsEditorRef.current &&
            editors.centerEditorRef.current &&
            (isTwoWay || editors.oursEditorRef.current)
          ) {
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
      [
        editors,
        attachScrollSync,
        scheduleRecompute,
        scheduleRecomputeRef,
        handleCenterContentEvent,
        applyScrollOffset,
        updateActiveBlockIndex,
        triggerUndo,
        triggerRedo,
        isTwoWay,
      ]
    )

    useImperativeHandle(
      ref,
      () => ({
        getCenterValue: () => editors.centerEditorRef.current?.getModel()?.getValue() ?? '',
        applyAutoMerge,
        acceptLeft: () => acceptAllForSide('left'),
        acceptRight: () => acceptAllForSide('right'),
        goToNextChange: () => navigateConflict('next'),
        goToPreviousChange: () => navigateConflict('prev'),
      }),
      [editors, applyAutoMerge, acceptAllForSide, navigateConflict]
    )

    const panes = useMemo(() => {
      if (isTwoWay) {
        return [
          {
            id: 'theirs' as const,
            value: original ?? '',
            readOnly: true,
            modelPath: `${modelPathPrefix}.original`,
          },
          {
            id: 'center' as const,
            value: modified ?? '',
            readOnly: true,
            modelPath: `${modelPathPrefix}.modified`,
          },
        ]
      }
      return [
        {
          id: 'theirs' as const,
          value: staticView.theirsText,
          readOnly: true,
          modelPath: `${modelPathPrefix}#theirs`,
        },
        {
          id: 'center' as const,
          value: initialCenterText,
          readOnly: false,
          modelPath: `${modelPathPrefix}#center`,
        },
        {
          id: 'ours' as const,
          value: staticView.oursText,
          readOnly: true,
          modelPath: `${modelPathPrefix}#ours`,
        },
      ]
    }, [isTwoWay, original, modified, modelPathPrefix, staticView, initialCenterText])

    const headerActions: ConflictResolverActionsConfig = {
      ...(typeof header === 'object' ? header : {}),
      // Two read-only panes, no merge target to write into or reset, and no host-side
      // `onRecalculate` wired to the right query key for a raw two-way diff — these buttons only
      // make sense in 3-panel mode, regardless of what the host's `header` config says.
      ...(isTwoWay
        ? { applyNonConflicting: false, autoMerge: false, reset: false, recalculate: false }
        : {}),
    }

    const currentLineHeight =
      editors.monacoRef.current && editors.centerEditorRef.current
        ? editors.centerEditorRef.current.getOption(
            editors.monacoRef.current.editor.EditorOption.lineHeight
          )
        : DEFAULT_LINE_HEIGHT

    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#1a1a1a]">
        {header !== false && (
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
            statuses={[
              panelsInput[0]?.status ?? null,
              panelsInput[1]?.status ?? null,
              panelsInput[2]?.status ?? null,
            ]}
            panelWidths={panelWidths}
            gapWidth={GAP_WIDTH}
          />
        )}
        <div ref={containerRef} className="flex min-h-0 w-full flex-1 overflow-hidden">
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
                  className="relative shrink-0 select-none overflow-hidden"
                  style={{
                    width: GAP_WIDTH,
                    cursor: isTwoWay ? 'default' : 'col-resize',
                    backgroundColor: 'var(--vscode-editor-background, #1e1e1e)',
                  }}
                  onMouseDown={
                    isTwoWay ? undefined : index === 0 ? handleLeftMouseDown : handleRightMouseDown
                  }
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
                    scrollTopLeft={
                      index === 0
                        ? (editors.theirsEditorRef.current?.getScrollTop() ?? 0)
                        : (editors.centerEditorRef.current?.getScrollTop() ?? 0)
                    }
                    scrollTopRight={
                      index === 0
                        ? (editors.centerEditorRef.current?.getScrollTop() ?? 0)
                        : (editors.oursEditorRef.current?.getScrollTop() ?? 0)
                    }
                    lineHeight={currentLineHeight}
                    wavePhaseOffset={index === 0 ? gapPhaseOffsets.left : gapPhaseOffsets.right}
                    onExpandBlock={expandBlock}
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
