import { useCallback, useRef, type RefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import { MARKDOWN_COMMANDS, type MarkdownCommandId } from './markdownCommands'

export interface UseMarkdownLiveEditorResult {
  /** Handed to `MarkdownLiveEditor`, which parks its editor here once mounted. */
  viewRef: RefObject<EditorView | null>
  /** Applies a formatting command to the live editor's current selection. */
  runCommand: (command: MarkdownCommandId) => void
}

/**
 * The formatted editor's half of the toolbar wiring — the counterpart of `useMarkdownEditor`, over
 * a CodeMirror view instead of a textarea.
 *
 * The commands themselves are shared: they are pure functions from a string and a selection to an
 * edit, so neither editor has a formatting rule of its own to drift from the other's. What differs
 * is only how the edit is delivered, and CodeMirror asks for far less care than the textarea does —
 * a transaction is already undoable and already leaves the scroll alone, which is exactly what
 * `useMarkdownEditor` has to reproduce by hand.
 */
export function useMarkdownLiveEditor(): UseMarkdownLiveEditorResult {
  const viewRef = useRef<EditorView | null>(null)

  const runCommand = useCallback((command: MarkdownCommandId) => {
    const view = viewRef.current
    if (!view) return

    const { main } = view.state.selection
    const edit = MARKDOWN_COMMANDS[command]({
      value: view.state.doc.toString(),
      selectionStart: main.from,
      selectionEnd: main.to,
    })
    if (!edit) return

    view.dispatch({
      changes: { from: edit.from, to: edit.to, insert: edit.text },
      selection: { anchor: edit.selectionStart, head: edit.selectionEnd },
      scrollIntoView: false,
    })
    view.focus()
  }, [])

  return { viewRef, runCommand }
}
