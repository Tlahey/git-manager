import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { editor, IRange } from 'monaco-editor'
import type { BlockPlacement } from '../../mergeBlockLayout'
import type { MergeEditorRefs } from './useMergeEditorRefs'

/** One undoable gutter/wand/bulk action: the placements maps on either side of it, plus the
 * center model's alternative-version ids bracketing the text edit (if any) so undo/redo events
 * coming from Monaco can be matched back to the action they revert/re-apply. */
export interface HistoryEntry {
  prePlacements: Map<number, BlockPlacement>
  postPlacements: Map<number, BlockPlacement>
  altIdBefore: number
  altIdAfter: number
  textChange: boolean
}

interface UseMergeHistoryParams {
  editors: MergeEditorRefs
  containerRef: RefObject<HTMLDivElement | null>
  executeWithScrollPreservation: (action: () => void) => void
  scheduleRecompute: () => void
  updatePlacementsStateAndRef: (next: Map<number, BlockPlacement>) => void
  /** Re-derives placements from the center buffer's live text after a manual edit (or an
   * undo/redo that doesn't match a recorded gutter action). */
  syncPlacementsFromBuffer: () => void
}

/** Undo/redo-aware bookkeeping for placement-changing actions. Monaco's own undo/redo stack
 * operates on the model text only, so Ctrl+Z reverts the *content* but would leave our separate
 * `placements` state (colors, widgets) pointing at whatever the now-undone action set it to.
 * Mirroring Monaco's stack with this placements history keeps the two in lockstep for the
 * common case (undoing/redoing a gutter click or wand application) instead of trying to
 * re-derive state from arbitrary text.
 *
 * Every action snapshots the placements map it's about to replace via `recordEntry` (which also
 * clears the redo stack — new branch of history, matching normal editor semantics).
 * `applyTrackedEdit` flags our own `executeEdits` calls so the center pane's content-change
 * listener can tell "we just made this edit ourselves" apart from a genuine undo/redo/manual
 * keystroke — without this, Ctrl+Z would change the buffer text back but leave gutter
 * widgets/colors stuck on whatever they were set to by the action being undone. */
export function useMergeHistory({
  editors,
  containerRef,
  executeWithScrollPreservation,
  scheduleRecompute,
  updatePlacementsStateAndRef,
  syncPlacementsFromBuffer,
}: UseMergeHistoryParams) {
  const historyRef = useRef<HistoryEntry[]>([])
  const redoRef = useRef<HistoryEntry[]>([])
  const isApplyingOwnEditRef = useRef(false)
  const isUndoingGutterActionRef = useRef(false)
  const isRedoingGutterActionRef = useRef(false)

  /** Pushes an action onto the undo stack and clears redo (a new action invalidates it). */
  const recordEntry = useCallback((entry: HistoryEntry) => {
    historyRef.current.push(entry)
    redoRef.current = []
  }, [])

  /** Wipes both stacks — used when switching to a different file. */
  const resetHistory = useCallback(() => {
    historyRef.current = []
    redoRef.current = []
  }, [])

  /** Runs one of our own center-pane edits, flagged so the content-change listener ignores it.
   * `pushStack` brackets the edit in its own Monaco undo stop (all gutter/bulk actions do; the
   * wand historically doesn't). */
  const applyTrackedEdit = useCallback(
    (
      centerEditor: editor.IStandaloneCodeEditor,
      model: editor.ITextModel,
      source: string,
      edit: { range: IRange; text: string },
      { pushStack = true }: { pushStack?: boolean } = {}
    ) => {
      if (pushStack) model.pushStackElement()
      isApplyingOwnEditRef.current = true
      centerEditor.executeEdits(source, [edit])
      isApplyingOwnEditRef.current = false
      if (pushStack) model.pushStackElement()
    },
    []
  )

  const triggerUndo = useCallback(() => {
    executeWithScrollPreservation(() => {
      const centerEditor = editors.centerEditorRef.current
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
  }, [editors, executeWithScrollPreservation, scheduleRecompute, updatePlacementsStateAndRef])

  const triggerRedo = useCallback(() => {
    executeWithScrollPreservation(() => {
      const centerEditor = editors.centerEditorRef.current
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
  }, [editors, executeWithScrollPreservation, scheduleRecompute, updatePlacementsStateAndRef])

  /** The center pane's `onDidChangeModelContent` listener: matches Monaco undo/redo events back
   * to recorded gutter actions (restoring the paired placements snapshot), and treats anything
   * else as manual typing — which clears the redo stack and falls back to re-deriving
   * placements from the buffer so widgets/connectors stay roughly aligned. */
  const handleCenterContentEvent = useCallback(
    (e: editor.IModelContentChangedEvent) => {
      if (isApplyingOwnEditRef.current) return

      const centerEditor = editors.centerEditorRef.current
      const model = centerEditor?.getModel()
      if (!model) return

      const currentAltId = model.getAlternativeVersionId()

      if (e.isUndoing) {
        const history = historyRef.current
        if (history.length > 0) {
          const entry = history[history.length - 1]
          if (
            isUndoingGutterActionRef.current ||
            (entry.textChange && currentAltId === entry.altIdBefore)
          ) {
            history.pop()
            redoRef.current.push(entry)
            updatePlacementsStateAndRef(entry.prePlacements)
            scheduleRecompute()
            return
          }
        }
        syncPlacementsFromBuffer()
        scheduleRecompute()
        return
      }

      if (e.isRedoing) {
        const redo = redoRef.current
        if (redo.length > 0) {
          const entry = redo[redo.length - 1]
          if (
            isRedoingGutterActionRef.current ||
            (entry.textChange && currentAltId === entry.altIdAfter)
          ) {
            redo.pop()
            historyRef.current.push(entry)
            updatePlacementsStateAndRef(entry.postPlacements)
            scheduleRecompute()
            return
          }
        }
        syncPlacementsFromBuffer()
        scheduleRecompute()
        return
      }

      // Genuine manual typing — clears the redo stack (matches normal editor semantics:
      // typing after an undo invalidates redo) and falls back to drift-attribution so
      // widgets/connectors stay roughly aligned.
      redoRef.current = []
      syncPlacementsFromBuffer()
      scheduleRecompute()
    },
    [editors, syncPlacementsFromBuffer, scheduleRecompute, updatePlacementsStateAndRef]
  )

  // Global capture-phase Ctrl/Cmd+Z / +Y / +Shift+Z interception: gutter actions that changed
  // no text never enter Monaco's own undo stack, so the shortcut must be caught before the
  // browser (or an unfocused Monaco pane) swallows it. Inputs outside the resolver keep their
  // native undo behavior.
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
  }, [containerRef, triggerUndo, triggerRedo])

  return {
    recordEntry,
    resetHistory,
    applyTrackedEdit,
    triggerUndo,
    triggerRedo,
    handleCenterContentEvent,
  }
}
