import { useCallback, useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'
import type * as monaco from 'monaco-editor'
import type { PaneIndex } from '../../useMergeScrollSync'
import type { MergeEditorRefs } from './useMergeEditorRefs'

// Typed against monaco-editor's own root export rather than `@monaco-editor/react`'s `Monaco`
// type — see the comment in `useMergeScrollSync.ts` for why.
type Monaco = typeof monaco

export type PaneId = 'ours' | 'center' | 'theirs'

interface UsePaneMountParams {
  editors: MergeEditorRefs
  isTwoWay: boolean
  /** Publishes the pane's resolved background to the chrome — see useMonacoBackgroundSync. Only
   * ever handed the `theirs` pane. */
  syncPaneBackground: (editorInstance: editor.IStandaloneCodeEditor) => void
  attachScrollSync: (editorInstance: editor.IStandaloneCodeEditor, paneIndex: PaneIndex) => void
  scheduleRecompute: () => void
  scheduleRecomputeRef: { current: () => void }
  applyScrollOffset: () => void
  applyStickyBanners: () => void
  updateActiveBlockIndex: () => void
  refreshIntraHighlights: () => void
  handleCenterContentEvent: (event: editor.IModelContentChangedEvent) => void
  triggerUndo: () => void
  triggerRedo: () => void
  /** Host's own mount hook, called last so it can override anything wired here. */
  onEditorMount?: (
    editorInstance: editor.IStandaloneCodeEditor,
    monacoInstance: Monaco,
    pane: PaneId
  ) => void
  /* The two pieces of state this hook produces are owned by the component rather than returned
   * from here, because both are read by hooks that must run *before* this one: `monaco` by
   * `useTwoWayDiffView`, `editorsReady` by `useCollapseUnchanged`. This hook depends on those
   * hooks' outputs in turn, so it runs last and can only hand its results back through setters. */
  onMonacoReady: (monacoInstance: Monaco) => void
  onEditorsReady: () => void
}

/** Everything that happens when one Monaco pane mounts, in the order it has to happen: register
 * the instance, give it its decoration collections, subscribe the listeners that keep the three
 * panes agreeing with each other, and — once the last pane reports in — take the first geometry
 * reading.
 *
 * Returns a curried `handlePaneMount(pane)` for `CodePane`'s `onMount`. Each pane runs the shared
 * wiring plus the part specific to its role: `theirs` publishes the theme background, `center`
 * owns the content-change subscription and the undo/redo keybindings (the resolver intercepts
 * both so a gutter action that changed no text is still undoable).
 *
 * Its own coverage is `ConflictResolver.test.tsx` rather than a suite here: every branch below is
 * a Monaco subscription whose effect is only observable through a mounted resolver, and the fake
 * pane that makes that possible (`__tests__/fakeMonacoPane.tsx`) stands in for the editor, not
 * for this wiring. A test here would have to rebuild that harness to assert less. */
export function usePaneMount({
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
  onEditorMount,
  onMonacoReady,
  onEditorsReady,
}: UsePaneMountParams) {
  // Read through a ref for the same reason `scheduleRecomputeRef` exists: the scroll listener
  // below is registered once at pane mount and Monaco never re-subscribes it.
  const refreshIntraHighlightsRef = useRef(refreshIntraHighlights)
  refreshIntraHighlightsRef.current = refreshIntraHighlights

  // Host mount hook kept in a ref so pane mount callbacks don't re-wire when the host passes
  // a new inline function on every render.
  const onEditorMountRef = useRef(onEditorMount)
  onEditorMountRef.current = onEditorMount

  // Pending follow-up recompute timers (see the belt-and-suspenders block below). Tracked so
  // unmounting before they fire clears them — otherwise a leaked timeout runs `scheduleRecompute`
  // (→ `requestAnimationFrame`) after teardown, which throws under jsdom.
  const followUpTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const timers = followUpTimersRef.current
    return () => timers.forEach(clearTimeout)
  }, [])

  /** Two collections per pane: whole-line block fills, and the word-level highlights that refresh
   * on scroll (see useMergeDecorations for why they must not share one). */
  const registerPane = useCallback(
    (pane: PaneId, editorInstance: editor.IStandaloneCodeEditor) => {
      if (pane === 'ours') {
        editors.oursEditorRef.current = editorInstance
        editors.oursDecorationsRef.current = editorInstance.createDecorationsCollection([])
        editors.oursIntraDecorationsRef.current = editorInstance.createDecorationsCollection([])
      }
      if (pane === 'center') {
        editors.centerEditorRef.current = editorInstance
        editors.centerDecorationsRef.current = editorInstance.createDecorationsCollection([])
        editors.centerIntraDecorationsRef.current = editorInstance.createDecorationsCollection([])
      }
      if (pane === 'theirs') {
        editors.theirsEditorRef.current = editorInstance
        editors.theirsDecorationsRef.current = editorInstance.createDecorationsCollection([])
        editors.theirsIntraDecorationsRef.current = editorInstance.createDecorationsCollection([])
      }
    },
    [editors]
  )

  const subscribePaneListeners = useCallback(
    (pane: PaneId, editorInstance: editor.IStandaloneCodeEditor) => {
      // `PaneIndex` is theirs=0 / center=1 / ours=2 — the order `useMergeScrollSync`'s own
      // `getPaneLineRange`/`paneIndexToSide` decode, NOT the visual left-to-right order (which
      // happens to be the same). Registering a pane under the wrong index hands the sync the
      // *other* side's line ranges for it: in 2-panel mode the original pane was being scrolled
      // to the modified pane's block positions, so the two panes drifted apart past the first
      // hunk (invisible while a file is short enough to need no scrolling at all).
      const paneIndex: PaneIndex = pane === 'theirs' ? 0 : pane === 'center' ? 1 : 2
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
    },
    [
      attachScrollSync,
      applyScrollOffset,
      applyStickyBanners,
      updateActiveBlockIndex,
      scheduleRecomputeRef,
    ]
  )

  /** The center pane alone is editable, so it alone tracks content changes — and intercepts
   * undo/redo, because a gutter action that changed no text still has to be undoable and Monaco's
   * own history has never heard of it. */
  const subscribeCenterEditing = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
      editorInstance.onDidChangeModelContent((event) => handleCenterContentEvent(event))

      editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyZ, () => {
        triggerUndo()
      })
      editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyY, () => {
        triggerRedo()
      })
      editorInstance.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyZ,
        () => {
          triggerRedo()
        }
      )
    },
    [handleCenterContentEvent, triggerUndo, triggerRedo]
  )

  /** Whether every pane this mode needs has reported in. 2-panel mode has no `ours`. */
  const allPanesMounted = useCallback(
    () =>
      Boolean(
        editors.theirsEditorRef.current &&
        editors.centerEditorRef.current &&
        (isTwoWay || editors.oursEditorRef.current)
      ),
    [editors, isTwoWay]
  )

  const takeFirstReading = useCallback(() => {
    onEditorsReady()
    // Panes normally mount already scrolled to the top, but seed the paths from whatever the
    // panes actually report rather than assuming 0.
    applyScrollOffset()
    applyStickyBanners()
    updateActiveBlockIndex()
    // Belt-and-suspenders: schedule a couple of follow-up recomputes a moment after all panes
    // report ready, in case the very first layout pass (and thus the very first
    // `getTopForLineNumber` reads) happened before the browser's first paint.
    followUpTimersRef.current.push(
      setTimeout(() => scheduleRecompute(), 50),
      setTimeout(() => scheduleRecompute(), 250)
    )
  }, [
    onEditorsReady,
    applyScrollOffset,
    applyStickyBanners,
    updateActiveBlockIndex,
    scheduleRecompute,
  ])

  return useCallback(
    (pane: PaneId) => (editorInstance: editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
      editors.monacoRef.current = monacoInstance
      onMonacoReady(monacoInstance)

      registerPane(pane, editorInstance)
      if (pane === 'theirs') syncPaneBackground(editorInstance)
      subscribePaneListeners(pane, editorInstance)
      if (pane === 'center') subscribeCenterEditing(editorInstance, monacoInstance)

      onEditorMountRef.current?.(editorInstance, monacoInstance, pane)

      if (allPanesMounted()) takeFirstReading()
    },
    [
      editors,
      onMonacoReady,
      registerPane,
      syncPaneBackground,
      subscribePaneListeners,
      subscribeCenterEditing,
      allPanesMounted,
      takeFirstReading,
    ]
  )
}
