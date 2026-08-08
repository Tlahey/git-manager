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
import type { editor } from 'monaco-editor'
import type * as monaco from 'monaco-editor'
import type { MergeBlock } from './types'
import {
  ConflictResolverHeader,
  type ConflictResolverActionsConfig,
  type ConflictResolverLabels,
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
import { DEFAULT_LINE_HEIGHT, GAP_WIDTH } from './mergeViewConfig'
import { type InternalMergeView } from './conflict-resolver/twoWayView'
import { type PaneSide } from './conflict-resolver/collapsedRegions'
import { useLineTopGeometry } from './conflict-resolver/hooks/useLineTopGeometry'
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

// Typed against monaco-editor's own root export rather than `@monaco-editor/react`'s `Monaco`
// type — see the comment in `useMergeScrollSync.ts` for why.
type Monaco = typeof monaco

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
  /** Extra Monaco options merged underneath every pane's own required options (readOnly,
   * glyphMargin, minimap, etc. always win) — e.g. `{ stickyScroll: { enabled: false } }`. */
  options?: editor.IStandaloneEditorConstructionOptions
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
  /** Per-string overrides for the header — see `ConflictResolverLabels`. Omitted strings fall
   * back to the built-in English defaults. */
  labels?: ConflictResolverLabels
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
  /** Initial collapse-unchanged state — the header's own toggle button controls it from there.
   * On by default: what a reader opens a diff for is what changed, and the untouched stretches
   * around it are noise to scroll past (this is also how JetBrains' and GitHub's diffs open).
   * Pass `false` for a view whose point is the surrounding file, not the change. */
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
      labels,
      onAutoMerge,
      onRecalculate,
      onPendingCountChange,
      showBlockBorders = false,
      defaultCollapseUnchanged = true,
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
    const dynamicDiff = useTwoWayDiffView(isTwoWay, monaco, original, modified, whitespaceMode)
    const dynamicView = dynamicDiff?.view ?? null
    const viewToUse = isTwoWay ? (dynamicView ?? dummyView) : staticView

    /* The texts the panes actually show in 2-way mode: the ones the current geometry describes,
     * NOT the newest ones handed down as props.
     *
     * Monaco answers the diff asynchronously, so for a moment after switching files the props are
     * the new file while the blocks are still the old one's. Painting the new text then means
     * painting it with no blocks — no collapsed regions, no decorations — and the collapse snaps
     * in a frame or two later, which is exactly the flicker this avoids. Deferring keeps the
     * previous file on screen for that moment instead, then swaps text, blocks and placements in
     * a single commit.
     *
     * The fallback to the raw props is not just for the first render: a diff result may never
     * arrive at all (Monaco computes it in the detached editor `useTwoWayDiffView` creates, which
     * an environment can leave unlaid-out and therefore silent — this package's own Storybook is
     * one). Deferring unconditionally would turn "no diff geometry" into "no text", which is a far
     * worse failure than showing the file uncollapsed. Nothing to defer *to* means show it. */
    const displayedOriginal = isTwoWay ? (dynamicDiff?.original ?? original ?? '') : undefined
    const displayedModified = isTwoWay ? (dynamicDiff?.modified ?? modified ?? '') : undefined

    const containerRef = useRef<HTMLDivElement | null>(null)
    // The resolver's own root. Carries `--merge-editor-background` — Monaco's actual resolved
    // editor background, republished as a CSS custom property so the parts of the resolver that
    // must be seamless with the panes (the inter-pane connector gaps) can reference it from CSS.
    // Kept in sync by the same `handlePaneMount` observer that syncs the left pane's padding.
    const rootRef = useRef<HTMLDivElement | null>(null)
    // The leftmost pane's wrapper gets padding-left (see styles.css's `.merge-pane-numbers-right`
    // rule) so its code isn't flush against the window/panel edge. That padding strip needs the
    // SAME background Monaco itself is painting, or it reads as a dead gap instead of inset
    // breathing room — handlePaneMount below keeps this ref's background synced to the theirs
    // pane's actual computed color.
    const leftPaneWrapperRef = useRef<HTMLDivElement | null>(null)
    const blocksRef = useRef<MergeBlock[]>(viewToUse.blocks)
    blocksRef.current = viewToUse.blocks

    const initialCenterText = useMemo(() => {
      if (isTwoWay) return displayedModified ?? ''
      return computeInitialCenterText(viewToUse.blocks)
    }, [isTwoWay, displayedModified, viewToUse.blocks])

    const [placementsState, setPlacementsState] = useState<Map<number, BlockPlacement>>(() => {
      if (isTwoWay) return new Map()
      return computeInitialPlacements(viewToUse.blocks)
    })

    /* 2-panel placements are a pure function of the blocks — the panes are read-only, so nothing
     * ever mutates them. Deriving instead of pushing them through an effect matters for the same
     * reason `displayedOriginal` exists: an effect would land a render *after* the new blocks, so
     * there would be one commit where the new content is paired with the previous file's
     * placements. Read-only mode has no state to lose by recomputing. */
    const twoWayPlacements = useMemo(() => {
      if (!isTwoWay || !dynamicView) return null
      const derived = new Map<number, BlockPlacement>()
      for (const block of dynamicView.blocks) {
        derived.set(block.blockId, {
          blockId: block.blockId,
          centerStartLine: block.oursStartLine, // modified start line!
          centerLineCount: block.oursLineCount, // modified line count!
          oursIncluded: false,
          theirsIncluded: false,
          oursTouched: false,
          theirsTouched: false,
        })
      }
      return derived
    }, [isTwoWay, dynamicView])

    const placements = twoWayPlacements ?? placementsState
    const placementsRef = useRef(placements)
    placementsRef.current = placements

    const updatePlacementsStateAndRef = useCallback((next: Map<number, BlockPlacement>) => {
      placementsRef.current = next
      setPlacementsState(next)
    }, [])

    const editors = useMergeEditorRefs()
    const { ignoreScrollSyncRef, executeWithScrollPreservation, restoreSavedScrollTops } =
      useScrollPreservation(editors)

    // useCollapseUnchanged needs to schedule connector recomputes, but useMergeConnectors in
    // turn needs the collapse state — this stable indirection breaks the cycle: the collapse
    // hook gets a never-changing callback that reads whatever the connectors hook's current
    // scheduleRecompute is (assigned right after that hook runs, below).
    const scheduleRecomputeIndirectionRef = useRef<() => void>(() => {})
    const stableScheduleRecompute = useCallback(() => scheduleRecomputeIndirectionRef.current(), [])

    const {
      collapseUnchanged,
      setCollapseUnchanged,
      expandedBlocks,
      expandBlock,
      applyStickyBanners,
    } = useCollapseUnchanged({
      editors,
      blocks: viewToUse.blocks,
      placements,
      scheduleRecompute: stableScheduleRecompute,
      defaultCollapseUnchanged,
      editorsReady,
    })

    const lineTopForSide = useLineTopGeometry({
      blocksRef,
      placementsRef,
      expandedBlocks,
      collapseUnchanged,
      isTwoWay,
      showBlockBorders,
      highlightMode,
    })

    /** A line's top Y offset in a pane's content space, accounting for collapsed (hidden)
     * regions and every alignment/banner view zone above it — the shared geometry basis for
     * scroll sync and connector ribbons. The pane editor is only read for its line height; the
     * geometry itself comes from `useLineTopGeometry`'s per-state memoized index (see that file
     * for why resolving it per call is a performance trap on large files). */
    const getTop = useCallback(
      (_paneEditor: editor.IStandaloneCodeEditor, lineNumber: number, side: PaneSide): number => {
        const lineHeight =
          editors.monacoRef.current && editors.centerEditorRef.current
            ? editors.centerEditorRef.current.getOption(
                editors.monacoRef.current.editor.EditorOption.lineHeight
              )
            : DEFAULT_LINE_HEIGHT

        return lineTopForSide(side, lineNumber, lineHeight)
      },
      [editors, lineTopForSide]
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

      setPlacementsState((prev) => {
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

    const { refreshIntraHighlights } = useMergeDecorations({
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

    // Read through a ref for the same reason `scheduleRecomputeRef` exists: the scroll listener
    // below is registered once at pane mount and Monaco never re-subscribes it.
    const refreshIntraHighlightsRef = useRef(refreshIntraHighlights)
    refreshIntraHighlightsRef.current = refreshIntraHighlights

    // Host mount hook kept in a ref so pane mount callbacks don't re-wire when the host passes
    // a new inline function on every render.
    const onEditorMountRef = useRef(editorConfig?.onEditorMount)
    onEditorMountRef.current = editorConfig?.onEditorMount

    // Pending follow-up recompute timers (see the belt-and-suspenders block in handlePaneMount).
    // Tracked so unmounting before they fire clears them — otherwise a leaked timeout runs
    // `scheduleRecompute` (→ `requestAnimationFrame`) after teardown, which throws under jsdom.
    const followUpTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
    useEffect(() => {
      const timers = followUpTimersRef.current
      return () => timers.forEach(clearTimeout)
    }, [])

    const handlePaneMount = useCallback(
      (pane: 'ours' | 'center' | 'theirs') =>
        (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
          editors.monacoRef.current = monacoInstance
          setMonaco(monacoInstance)
          if (pane === 'ours') editors.oursEditorRef.current = editorInstance
          if (pane === 'center') editors.centerEditorRef.current = editorInstance
          if (pane === 'theirs') editors.theirsEditorRef.current = editorInstance

          // Two collections per pane: whole-line block fills, and the word-level highlights that
          // refresh on scroll (see useMergeDecorations for why they must not share one).
          if (pane === 'ours') {
            editors.oursDecorationsRef.current = editorInstance.createDecorationsCollection([])
            editors.oursIntraDecorationsRef.current = editorInstance.createDecorationsCollection([])
          }
          if (pane === 'center') {
            editors.centerDecorationsRef.current = editorInstance.createDecorationsCollection([])
            editors.centerIntraDecorationsRef.current = editorInstance.createDecorationsCollection(
              []
            )
          }
          if (pane === 'theirs') {
            editors.theirsDecorationsRef.current = editorInstance.createDecorationsCollection([])
            editors.theirsIntraDecorationsRef.current = editorInstance.createDecorationsCollection(
              []
            )
          }

          // Standalone monaco-editor (unlike a real VS Code webview) never exposes its resolved
          // theme colors as CSS custom properties, and `monaco.editor` has no theme-change event
          // to hook — so the only reliable way to keep the chrome around the panes matching
          // whatever theme is active (built-in or a host's dynamically-generated one) is to read
          // Monaco's own computed background directly and re-read it whenever the editor's
          // class/style attributes change (which is exactly what `setTheme` mutates). The value
          // goes onto the left pane's padding wrapper AND onto the root as
          // `--merge-editor-background`, which the inter-pane gaps paint themselves with.
          if (pane === 'theirs') {
            const domNode = editorInstance.getDomNode()
            if (domNode) {
              const syncBackground = () => {
                const background = getComputedStyle(domNode).backgroundColor
                if (leftPaneWrapperRef.current) {
                  leftPaneWrapperRef.current.style.backgroundColor = background
                }
                rootRef.current?.style.setProperty('--merge-editor-background', background)
              }
              syncBackground()
              const observer = new MutationObserver(syncBackground)
              observer.observe(domNode, { attributes: true, attributeFilter: ['class', 'style'] })
              editorInstance.onDidDispose(() => observer.disconnect())
            }
          }

          // `PaneIndex` is theirs=0 / center=1 / ours=2 — the order `useMergeScrollSync`'s own
          // `getPaneLineRange`/`paneIndexToSide` decode, NOT the visual left-to-right order (which
          // happens to be the same). Registering a pane under the wrong index hands the sync the
          // *other* side's line ranges for it: in 2-panel mode the original pane was being scrolled
          // to the modified pane's block positions, so the two panes drifted apart past the first
          // hunk (invisible while a file is short enough to need no scrolling at all).
          const paneIndex = pane === 'theirs' ? 0 : pane === 'center' ? 1 : 2
          attachScrollSync(editorInstance, paneIndex)
          editorInstance.onDidScrollChange(() => {
            applyScrollOffset()
            applyStickyBanners()
            if (pane === 'center') {
              updateActiveBlockIndex()
              // Word-level highlights are computed for the visible range only, so scrolling is
              // what brings the next screenful's into existence (coalesced to one frame).
              refreshIntraHighlightsRef.current()
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
            applyStickyBanners()
            updateActiveBlockIndex()
            // Belt-and-suspenders: schedule a couple of follow-up recomputes a moment after all
            // three editors report ready, in case the very first layout pass (and thus the very
            // first `getTopForLineNumber` reads) happened before the browser's first paint.
            followUpTimersRef.current.push(
              setTimeout(() => scheduleRecompute(), 50),
              setTimeout(() => scheduleRecompute(), 250)
            )
          }
        },
      [
        editors,
        attachScrollSync,
        scheduleRecompute,
        scheduleRecomputeRef,
        handleCenterContentEvent,
        applyScrollOffset,
        applyStickyBanners,
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
            value: displayedOriginal ?? '',
            readOnly: true,
            modelPath: `${modelPathPrefix}.original`,
          },
          {
            id: 'center' as const,
            value: displayedModified ?? '',
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
    }, [
      isTwoWay,
      displayedOriginal,
      displayedModified,
      modelPathPrefix,
      staticView,
      initialCenterText,
    ])

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
      <div ref={rootRef} className="flex h-full w-full flex-col overflow-hidden bg-background">
        {header !== false && (
          <ConflictResolverHeader
            actions={headerActions}
            labels={labels}
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
                ref={index === 0 ? leftPaneWrapperRef : undefined}
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
                  options={editorConfig?.options}
                />
              </div>
              {index < panes.length - 1 && (
                <div
                  className="relative shrink-0 select-none overflow-hidden"
                  style={{
                    width: GAP_WIDTH,
                    cursor: isTwoWay ? 'default' : 'col-resize',
                    // Monaco's own resolved background, published as `--merge-editor-background`
                    // by handlePaneMount — the gap has to be seamless with the panes it sits
                    // between. Falls back to the app's own surface token until that first sync.
                    backgroundColor: 'var(--merge-editor-background, hsl(var(--background)))',
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
