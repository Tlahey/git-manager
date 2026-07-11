import { useCallback, useRef } from 'react'
import type { MergeEditorRefs } from './useMergeEditorRefs'

/** Keeps the three panes' scroll positions stable across placement-changing actions (gutter
 * clicks, wand, reset, undo/redo): the action snapshots every pane's scrollTop and pauses the
 * scroll sync before running, and the decorations effect restores the snapshot (and resumes
 * sync a frame later) once the new placements have been painted. Without the pause, the sync
 * listeners would fight the restoration and yank the panes around mid-action. */
export function useScrollPreservation(editors: MergeEditorRefs) {
  const ignoreScrollSyncRef = useRef(false)
  const savedScrollTopsRef = useRef<{ ours: number; center: number; theirs: number } | null>(null)

  const saveScrollTopsAndPauseSync = useCallback(() => {
    const oursEditor = editors.oursEditorRef.current
    const centerEditor = editors.centerEditorRef.current
    const theirsEditor = editors.theirsEditorRef.current
    if (oursEditor && centerEditor && theirsEditor) {
      savedScrollTopsRef.current = {
        ours: oursEditor.getScrollTop(),
        center: centerEditor.getScrollTop(),
        theirs: theirsEditor.getScrollTop(),
      }
      ignoreScrollSyncRef.current = true
    }
  }, [editors])

  const executeWithScrollPreservation = useCallback(
    (action: () => void) => {
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
    },
    [saveScrollTopsAndPauseSync]
  )

  /** Restores the snapshot taken by the last preserved action, if one is still pending — called
   * from the decorations effect after the new placements have been applied to the panes. */
  const restoreSavedScrollTops = useCallback(
    (isTwoWay: boolean) => {
      if (!savedScrollTopsRef.current) return
      const { ours, center, theirs } = savedScrollTopsRef.current
      const oursEditor = editors.oursEditorRef.current
      if (!isTwoWay && oursEditor) oursEditor.setScrollTop(ours)
      editors.centerEditorRef.current?.setScrollTop(center)
      editors.theirsEditorRef.current?.setScrollTop(theirs)
      savedScrollTopsRef.current = null
      requestAnimationFrame(() => {
        ignoreScrollSyncRef.current = false
      })
    },
    [editors]
  )

  return { ignoreScrollSyncRef, executeWithScrollPreservation, restoreSavedScrollTops }
}
