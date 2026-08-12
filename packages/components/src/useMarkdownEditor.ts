import { useCallback, useRef, type KeyboardEvent, type RefObject } from 'react'
import { MARKDOWN_COMMANDS, MARKDOWN_SHORTCUTS, type MarkdownCommandId } from './markdownCommands'
import { applyEdit } from './markdownEdit'

export interface UseMarkdownEditorResult {
  /** Attach to the textarea the toolbar drives. */
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** Applies a formatting command to the current selection. */
  runCommand: (id: MarkdownCommandId) => void
  /** Attach to the textarea's `onKeyDown` for the GitHub keyboard shortcuts. */
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}

/**
 * Drives a plain `<textarea>` from the formatting commands: it reads the live selection, asks the
 * pure command for an edit, and replays that edit on the element.
 *
 * **Applying a command must not move the view, and must stay undoable.** Three things conspire
 * against that, and all three are handled here — change one and check the test named for it:
 *  1. assigning `textarea.value` resets `scrollTop` on WebKit (which is what the app runs on) and
 *     wipes the native undo stack, so ⌘Z after a click on bold would drop the user's whole draft;
 *  2. `focus()` scrolls the caret into view — harmless in itself, except the toolbar button stole
 *     the focus first, so the scroll happens on every single click. `MarkdownToolbar` prevents the
 *     default on pointer-down so focus never leaves, and the `preventScroll` focus here is only a
 *     belt for the keyboard path;
 *  3. `execCommand('insertText')` — deprecated, and still the only API that edits a textarea *as if
 *     the user typed*, which is what preserves both the undo stack and the scroll position. It
 *     emits a real `input` event, so a controlled React textarea updates through its own `onChange`
 *     with nothing extra to do. The manual fallback below exists for jsdom (no `execCommand`) and
 *     notifies the caller itself, since assigning `.value` emits nothing.
 */
export function useMarkdownEditor(onChange: (value: string) => void): UseMarkdownEditorResult {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const runCommand = useCallback(
    (id: MarkdownCommandId) => {
      const element = textareaRef.current
      if (!element) return

      const state = {
        value: element.value,
        selectionStart: element.selectionStart,
        selectionEnd: element.selectionEnd,
      }
      const edit = MARKDOWN_COMMANDS[id](state)
      if (!edit) return

      const { scrollTop } = element
      element.focus({ preventScroll: true })
      element.setSelectionRange(edit.from, edit.to)

      const typed =
        typeof document.execCommand === 'function' &&
        document.execCommand('insertText', false, edit.text)

      if (!typed) {
        const next = applyEdit(state, edit)
        element.value = next.value
        onChange(next.value)
      }

      element.setSelectionRange(edit.selectionStart, edit.selectionEnd)
      element.scrollTop = scrollTop
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!event.metaKey && !event.ctrlKey) return
      const key = event.key.toLowerCase()
      const id = MARKDOWN_SHORTCUTS[event.shiftKey ? `shift+${key}` : key]
      if (!id) return
      event.preventDefault()
      runCommand(id)
    },
    [runCommand]
  )

  return { textareaRef, runCommand, handleKeyDown }
}
