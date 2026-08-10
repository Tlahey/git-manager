import { useCallback, type RefObject } from 'react'
import type { editor } from 'monaco-editor'

interface UseMonacoBackgroundSyncParams {
  /** The resolver's own root — receives `--merge-editor-background`. */
  rootRef: RefObject<HTMLDivElement | null>
  /** The leftmost pane's padding wrapper — receives the color directly. */
  leftPaneWrapperRef: RefObject<HTMLDivElement | null>
}

/** Republishes Monaco's *resolved* editor background as CSS the chrome around the panes can use:
 * `--merge-editor-background` on the resolver root (the inter-pane connector gaps paint
 * themselves with it, so they read as one surface with the panes), and directly as the left
 * pane's padding-strip background (see styles.css's `.merge-pane-numbers-right` — that strip
 * has to be the same color Monaco is painting, or the inset reads as a dead gap).
 *
 * Read off the DOM rather than computed from the theme, because there is nothing to compute
 * from: standalone monaco-editor (unlike a real VS Code webview) never exposes its resolved
 * theme colors as CSS custom properties, and `monaco.editor` has no theme-change event to
 * subscribe to. So the only reliable way to track whatever theme is active — built-in, or a
 * host's dynamically-generated one — is to read the editor's own computed background and re-read
 * it whenever its `class`/`style` attributes change, which is exactly what `setTheme` mutates.
 *
 * Returns a callback to hand one pane's editor on mount; the observer disconnects with that
 * editor. Wiring more than one pane would just have them overwrite each other with the same
 * value — the resolver calls it for `theirs` alone. */
export function useMonacoBackgroundSync({
  rootRef,
  leftPaneWrapperRef,
}: UseMonacoBackgroundSyncParams) {
  return useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      const domNode = editorInstance.getDomNode()
      if (!domNode) return

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
    },
    [rootRef, leftPaneWrapperRef]
  )
}
