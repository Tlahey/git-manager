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
import { useMonacoBackgroundSync } from './conflict-resolver/hooks/useMonacoBackgroundSync'
import { usePaneMount } from './conflict-resolver/hooks/usePaneMount'

/* English fallbacks for the names of controls the resolver renders itself — the gutter actions
 * and the collapsed-region banner. The header keeps its own defaults; these are here because
 * these controls are. A host that translates the toolbar should pass all of them. */
const DEFAULT_ACCEPT_INCOMING_LABEL = 'Accept incoming change'
const DEFAULT_ACCEPT_CURRENT_LABEL = 'Accept current change'
const DEFAULT_IGNORE_CHANGE_LABEL = 'Ignore this change'
const defaultCollapsedLinesLabel = (count: number) =>
  `${count} ${count === 1 ? 'line' : 'lines'} collapsed`

/** How long a 2-panel pane stays empty waiting for the geometry that describes its text before
 * giving up and painting the raw file uncollapsed — see `rawTextAllowed`. Long enough that a real
 * diff (a detached Monaco diff editor, answering in a frame or two) always wins the race, short
 * enough that a host whose diff never answers reads as a load rather than a hang. */
const RAW_TEXT_FALLBACK_MS = 500

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
  /** Shown while the editor has nothing to display: as each pane's Suspense fallback (the Monaco
   * chunk still loading) and, in 2-panel mode, over the panes while they wait for the geometry that
   * describes their text — the two moments a reader would otherwise face a blank rectangle. Host
   * provided because the strings in it need translating. */
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
 * undo/redo history, merge actions, navigation, decorations, pane mount). What remains here is
 * state ownership and the wiring between those hooks: several of them need each other's output,
 * and the order they are called in is the one order that resolves — which is why they are read
 * from top to bottom rather than grouped by subject. */
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
    const dynamicDiff = useTwoWayDiffView(
      isTwoWay,
      monaco,
      original,
      modified,
      whitespaceMode,
      modelPathPrefix
    )
    const dynamicView = dynamicDiff?.view ?? null
    const viewToUse = isTwoWay ? (dynamicView ?? dummyView) : staticView

    /* Whether to paint a 2-panel file that has no geometry yet — see `displayedOriginal` below.
     *
     * Off until it times out, so the normal path never shows an uncollapsed file at all. It cannot
     * simply be off forever: a diff result may never arrive (Monaco computes it in the detached
     * editor `useTwoWayDiffView` creates, which an environment can leave unlaid-out and therefore
     * silent — this package's own Storybook is one), and never painting a file is a far worse
     * failure than painting it uncollapsed. So the raw props are a fallback on a timer rather than
     * the default. Keyed on the texts, so each new file gets its own grace period. */
    const [rawTextAllowed, setRawTextAllowed] = useState(false)
    useEffect(() => {
      if (!isTwoWay) return
      setRawTextAllowed(false)
      const timer = setTimeout(() => setRawTextAllowed(true), RAW_TEXT_FALLBACK_MS)
      return () => clearTimeout(timer)
    }, [isTwoWay, original, modified])

    /* The texts the panes actually show in 2-way mode: the ones the current geometry describes,
     * NOT the newest ones handed down as props.
     *
     * Monaco answers the diff asynchronously, so for a moment after switching files the props are
     * the new file while the blocks are still the old one's. Painting the new text then means
     * painting it with no blocks — no collapsed regions, no decorations — and the collapse snaps
     * in a frame or two later, which is exactly the flicker this avoids. Deferring keeps the
     * previous file on screen for that moment instead, then swaps text, blocks, placements and the
     * models they live in (see `TwoWayDiffView.modelPathPrefix`) in a single commit.
     *
     * On a *first* open there is no previous file to hold, so this deliberately renders nothing
     * until the geometry lands (`rawTextAllowed` above is the escape hatch for a host whose diff
     * never answers): an empty pane that fills in once is one transition, where painting the raw
     * text first is two — the whole file, then the collapse. */
    const geometryPending = isTwoWay && dynamicDiff === null && !rawTextAllowed
    const displayedOriginal = isTwoWay
      ? geometryPending
        ? ''
        : (dynamicDiff?.original ?? original ?? '')
      : undefined
    const displayedModified = isTwoWay
      ? geometryPending
        ? ''
        : (dynamicDiff?.modified ?? modified ?? '')
      : undefined
    /* The prefix naming the models the panes attach to. Deferred with the text for the reason that
     * type documents: taken from props it would swap the models — and with them the hidden areas and
     * every view zone — while the previous file is still the one on screen. */
    const displayedPrefix = isTwoWay
      ? (dynamicDiff?.modelPathPrefix ?? modelPathPrefix)
      : modelPathPrefix

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

    // Same shape of cycle, same fix, in the other direction: the collapsed-region banners are
    // positioned from the resolver's line-top geometry (see the collapse hook's `lineTop` param),
    // but that geometry is itself derived from the collapse state that hook owns. A stable
    // indirection lets it call whatever `getTop` currently is — assigned right after
    // `useLineTopGeometry` has produced it, a few lines down.
    const lineTopIndirectionRef = useRef<((side: PaneSide, lineNumber: number) => number) | null>(
      null
    )
    const stableLineTop = useCallback(
      (side: PaneSide, lineNumber: number) =>
        lineTopIndirectionRef.current?.(side, lineNumber) ?? 0,
      []
    )

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
      collapsedLinesLabel: labels?.collapsedLinesLabel ?? defaultCollapsedLinesLabel,
      lineTop: stableLineTop,
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
      (
        // Nullable so the collapse hook's banner geometry — which has no pane editor to hand over,
        // and doesn't need one — can go through this same function instead of a second copy of it.
        // Kept in the signature for parity with the `getTop`-shaped callback the connector builder
        // and the scroll sync consume.
        _paneEditor: editor.IStandaloneCodeEditor | null,
        lineNumber: number,
        side: PaneSide
      ): number => {
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

    lineTopIndirectionRef.current = (side, lineNumber) => getTop(null, lineNumber, side)

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

    /* Withheld, not zeroed, while the panes are still waiting for the geometry that describes their
     * text (see `geometryPending`): every block these are counted from arrives with it, so before
     * that the honest answer is "not known yet" rather than "none". */
    const reportedChangesCount = geometryPending ? null : changesCount
    const reportedConflictsCount = geometryPending ? null : conflictsCount

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
    // pointing at the *previous* file's blocks. Keyed on the prefix rather than on the
    // blocks themselves, since the host can hand back freshly-fetched (but identical) blocks
    // for the *same* file on revalidation — that shouldn't wipe in-progress edits.
    //
    // The *displayed* prefix, so this fires when the panes actually change file rather than when the
    // host asks for one: between those two moments the previous file is still on screen, and
    // resetting its placements there would strip the colors off what the reader is looking at.
    useEffect(() => {
      if (!isTwoWay) {
        updatePlacementsStateAndRef(computeInitialPlacements(viewToUse.blocks))
      }
      resetHistory()
      resetPanelWidths()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayedPrefix, updatePlacementsStateAndRef, isTwoWay, resetHistory, resetPanelWidths])

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

    const syncPaneBackground = useMonacoBackgroundSync({ rootRef, leftPaneWrapperRef })

    const handleEditorsReady = useCallback(() => setEditorsReady(true), [])

    const handlePaneMount = usePaneMount({
      editors,
      isTwoWay,
      syncPaneBackground,
      attachScrollSync,
      scheduleRecompute,
      scheduleRecomputeRef,
      applyScrollOffset,
      applyStickyBanners,
      updateActiveBlockIndex,
      refreshIntraHighlights,
      handleCenterContentEvent,
      triggerUndo,
      triggerRedo,
      onEditorMount: editorConfig?.onEditorMount,
      onMonacoReady: setMonaco,
      onEditorsReady: handleEditorsReady,
    })

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
            modelPath: `${displayedPrefix}.original`,
          },
          {
            id: 'center' as const,
            value: displayedModified ?? '',
            readOnly: true,
            modelPath: `${displayedPrefix}.modified`,
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
      // Both: 3-panel mode names its models from the prop, 2-panel from the deferred one. Missing
      // the deferred one here would mean a file whose text is byte-identical to the previous one
      // (two copies of the same file, a rename) never swapping models at all, since nothing else in
      // this list would have changed.
      modelPathPrefix,
      displayedPrefix,
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
            changesCount={reportedChangesCount}
            conflictsCount={reportedConflictsCount}
            statuses={[
              panelsInput[0]?.status ?? null,
              panelsInput[1]?.status ?? null,
              panelsInput[2]?.status ?? null,
            ]}
            panelWidths={panelWidths}
            gapWidth={GAP_WIDTH}
          />
        )}
        <div ref={containerRef} className="relative flex min-h-0 w-full flex-1 overflow-hidden">
          {/* The panes are mounted and empty on purpose while their geometry is being computed (see
              `geometryPending`) — Monaco has to be laid out to measure itself, so it can't be left
              out, but it has nothing to show yet. Saying so beats an unexplained blank rectangle.
              `relative` on the container above is only here to anchor this. */}
          {geometryPending && editorConfig?.loadingFallback && (
            <div
              data-testid="merge-panes-loading"
              className="absolute inset-0 z-10 flex items-center justify-center"
              style={{ backgroundColor: 'var(--merge-editor-background, hsl(var(--background)))' }}
            >
              {editorConfig.loadingFallback}
            </div>
          )}
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
                  className="relative shrink-0 overflow-hidden select-none"
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
                    acceptLabel={
                      index === 0
                        ? (labels?.acceptIncomingLabel ?? DEFAULT_ACCEPT_INCOMING_LABEL)
                        : (labels?.acceptCurrentLabel ?? DEFAULT_ACCEPT_CURRENT_LABEL)
                    }
                    rejectLabel={labels?.ignoreChangeLabel ?? DEFAULT_IGNORE_CHANGE_LABEL}
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
