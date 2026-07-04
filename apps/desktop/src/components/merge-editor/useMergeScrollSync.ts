import { useCallback, useRef } from 'react'
import type { editor } from 'monaco-editor'

type Editor = editor.IStandaloneCodeEditor
export type PaneIndex = 0 | 1 | 2

/** Pixel-offset (not line-based) scroll sync across the 3 panes — panes have different total
 * lengths (center shrinks/grows as blocks resolve), so line-for-line sync would fight the fact
 * that a block's start line differs per pane. The `syncingRef` guard prevents the classic
 * reentrant feedback loop (A scrolls B, which fires B's own scroll listener, which tries to
 * scroll A and C again) but is cleared synchronously right after the propagation loop below,
 * not deferred to the next animation frame: Monaco's `setScrollTop` fires `onDidScrollChange`
 * synchronously (`Scrollable._setState` in monaco-editor's `scrollable.js` calls `_onScroll.fire`
 * directly, no micro/macrotask involved), so the reentrant echo is already fully resolved by the
 * time the loop returns — there's nothing async left to guard against. Deferring the reset to
 * `requestAnimationFrame` (as this used to) left the guard up for up to a whole frame, which
 * silently swallowed any *further* genuine scroll events from the pane actually being scrolled
 * during fast/inertial trackpad scrolling (wheel events can fire faster than rAF) — the other two
 * panes, and the connector overlay that reads their live `getScrollTop()`, would then visibly lag
 * until scrolling slowed down enough for an event to land after the guard finally cleared. */
export function useMergeScrollSync() {
  const editorsRef = useRef<(Editor | null)[]>([null, null, null])
  const syncingRef = useRef(false)

  const attach = useCallback((editorInstance: Editor, index: PaneIndex) => {
    editorsRef.current[index] = editorInstance
    editorInstance.onDidScrollChange((e) => {
      if (syncingRef.current) return
      syncingRef.current = true
      try {
        editorsRef.current.forEach((other, i) => {
          if (i === index || !other) return
          other.setScrollTop(e.scrollTop)
        })
      } finally {
        syncingRef.current = false
      }
    })
  }, [])

  return { attach, editorsRef }
}
