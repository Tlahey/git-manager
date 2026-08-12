import { useEffect, useRef, type RefObject } from 'react'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
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
  /** Turns a markdown image path into one the webview can load. Omit it and images stay as source
   * text — resolving a repository-relative attachment is the app's business, not this package's. */
  resolveImageSrc?: (src: string) => string
  /** The translated name of a GitHub alert kind, for the callout titles. */
  alertLabel?: (kind: string) => string
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
  resolveImageSrc,
  alertLabel,
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
  // Wrapped in a ref like the rest: the extension is built once, and a caller that rebuilds its
  // resolver on every render would otherwise freeze the first one into the editor.
  const resolver = useRef((src: string) => (resolveImageSrc ? resolveImageSrc(src) : src))
  resolver.current = (src: string) => (resolveImageSrc ? resolveImageSrc(src) : src)
  const alerts = useRef((kind: string) => (alertLabel ? alertLabel(kind) : kind))
  alerts.current = (kind: string) => (alertLabel ? alertLabel(kind) : kind)

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
          // GFM, not plain CommonMark: task lists, tables and strikethrough are the syntax this
          // app's markdown actually uses, and `markdown()` alone parses none of them.
          markdown({ base: markdownLanguage }),
          markdownLivePreview({
            resolveImageSrc: (src) => resolver.current(src),
            alertLabel: (kind) => alerts.current(kind),
          }),
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
        // `font-sans` is what `MarkdownRenderer`'s root carries, and the reason it is spelled out
        // here too: nothing in the app sets a family on `body`, so the two views only agree if
        // both ask for it. The theme then makes CodeMirror's scroller inherit, or its own
        // monospace default wins over anything the container says.
        'min-h-[60px] w-full overflow-hidden rounded-md border border-input bg-transparent font-sans text-sm shadow-xs focus-within:ring-1 focus-within:ring-ring',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    />
  )
}
