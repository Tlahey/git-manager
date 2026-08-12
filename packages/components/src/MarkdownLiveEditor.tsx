import { useEffect, useRef, type RefObject } from 'react'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { cn } from '@git-manager/ui'
import { MARKDOWN_SHORTCUTS, type MarkdownCommandId } from './markdownCommands'
import { markdownLivePreview } from './markdownLivePreview'

export interface MarkdownLiveEditorProps {
  value: string
  onChange: (value: string) => void
  /** From `useMarkdownLiveEditor`, so the toolbar and this editor address the same view. */
  viewRef: RefObject<EditorView | null>
  /** Also from the hook — bound to the same keyboard shortcuts the textarea answers to. */
  onCommand: (command: MarkdownCommandId) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Called with the files of a paste or a drop, so a caller that stores attachments keeps doing it
   * in this mode too. Without it, both events fall through to CodeMirror's own handling. */
  onFiles?: (files: File[]) => void
  'data-testid'?: string
}

/** `⌘B` here, `b` in the shared table — the two shortcut vocabularies meet in one place. */
function shortcutKeymap(onCommand: (command: MarkdownCommandId) => void) {
  return Object.entries(MARKDOWN_SHORTCUTS).map(([combo, command]) => ({
    key: combo.startsWith('shift+') ? `Mod-Shift-${combo.slice('shift+'.length)}` : `Mod-${combo}`,
    run: () => {
      onCommand(command)
      return true
    },
  }))
}

/**
 * The formatted editing surface: a CodeMirror view whose content is the markdown itself, painted to
 * look like the result (see `markdownLivePreview`).
 *
 * The view is created once and then driven by transactions — React never re-renders its content.
 * The `value` effect below only exists for changes that come from *outside* the editor (a draft
 * reset on cancel, an AI-generated description), and it checks the document first so a keystroke
 * echoed back through the parent's state doesn't reset the selection on every character.
 */
export function MarkdownLiveEditor({
  value,
  onChange,
  viewRef,
  onCommand,
  placeholder,
  disabled,
  className,
  onFiles,
  'data-testid': testId,
}: MarkdownLiveEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const editable = useRef(new Compartment()).current
  // Read through a ref inside the update listener: the view outlives every render, so capturing the
  // first `onChange` would send edits to a stale setter.
  const notify = useRef(onChange)
  notify.current = onChange
  const command = useRef(onCommand)
  command.current = onCommand
  const files = useRef(onFiles)
  files.current = onFiles

  /** Only a *file* paste or drop is ours; text falls through to CodeMirror untouched. */
  function handleFiles(dropped: File[], event: Event): boolean {
    if (dropped.length === 0 || !files.current) return false
    event.preventDefault()
    files.current(dropped)
    return true
  }

  useEffect(() => {
    if (!host.current) return

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            ...shortcutKeymap((id) => command.current(id)),
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          markdown(),
          markdownLivePreview(),
          EditorView.lineWrapping,
          placeholderExtension(placeholder ?? ''),
          editable.of(EditorView.editable.of(true)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) notify.current(update.state.doc.toString())
          }),
          EditorView.domEventHandlers({
            paste: (event) => handleFiles(Array.from(event.clipboardData?.files ?? []), event),
            drop: (event) => handleFiles(Array.from(event.dataTransfer?.files ?? []), event),
          }),
        ],
      }),
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Mount-only: `value` and `placeholder` are handled by the effects below, and rebuilding the
    // view on either would throw away the caret and the undo history.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value, viewRef])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editable.reconfigure(EditorView.editable.of(!disabled)),
    })
  }, [disabled, editable, viewRef])

  return (
    <div
      ref={host}
      data-testid={testId}
      className={cn(
        'min-h-[60px] w-full overflow-hidden rounded-md border border-input bg-transparent text-sm shadow-xs focus-within:ring-1 focus-within:ring-ring',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    />
  )
}
