import type { Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { markdownDecorations, type MarkdownDecorationOptions } from './markdownDecorations'

/**
 * The "live preview" layer: the document stays plain markdown, and the result is painted over it —
 * headings sized, `**bold**` bold, images shown, checkboxes tickable — with the source of whatever
 * block holds the caret shown instead, so everything on screen can be edited where it stands.
 *
 * This is what makes formatted editing possible without a second document format. A WYSIWYG editor
 * would parse the markdown into a tree, let the user edit *that*, and serialize it back on save —
 * which reformats parts of the body nobody touched, and loses anything the serializer doesn't model
 * (our alerts, mermaid blocks and raw `<details>` among them). Here the text in the editor *is* the
 * text that gets sent; nothing is ever re-generated.
 *
 * The rules themselves live in `markdownDecorations`; this module is the wiring and the styling.
 */
export type { MarkdownDecorationOptions }

function livePreviewPlugin(options: MarkdownDecorationOptions) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = markdownDecorations(view.state, view.visibleRanges, options)
      }

      update(update: ViewUpdate) {
        // The selection matters as much as the document here: moving the caret onto a line is what
        // brings that line's source back.
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = markdownDecorations(
            update.view.state,
            update.view.visibleRanges,
            options
          )
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}

/**
 * Styling for the decorations, in the app's own tokens so it retints with the theme.
 *
 * The headings are sized and weighted like `MarkdownRenderer`'s, in `em` so both stay in step
 * whatever font size the surface gives the editor: 1.5em over the app's 12px body is its `text-lg`,
 * and so on down. That pairing is worth the duplication — a heading that changes shape between the
 * formatted tab and the preview reads as a bug.
 */
const livePreviewTheme = EditorView.theme({
  '&': { color: 'hsl(var(--foreground))', backgroundColor: 'transparent' },
  // CodeMirror's own base theme sets `font-family: monospace` on the scroller, so `inherit` on the
  // content alone inherits *that* — which is how the formatted tab ended up in a different typeface
  // from the preview. The line height matches the renderer's `leading-relaxed` for the same reason.
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.625' },
  '.cm-content': {
    padding: '0.5rem 0.75rem',
    fontFamily: 'inherit',
    caretColor: 'hsl(var(--foreground))',
  },
  '.cm-line': { padding: '0 2px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
  '.cm-placeholder': { color: 'hsl(var(--muted-foreground))' },

  '.cm-md-heading': { lineHeight: '1.6' },
  '.cm-md-h1': { fontSize: '1.5em', fontWeight: '800' },
  '.cm-md-h2': { fontSize: '1.333em', fontWeight: '700', color: 'hsl(var(--foreground) / 0.9)' },
  '.cm-md-h3': { fontSize: '1.167em', fontWeight: '600', color: 'hsl(var(--foreground) / 0.85)' },
  '.cm-md-h4, .cm-md-h5, .cm-md-h6': {
    fontSize: '1em',
    fontWeight: '600',
    color: 'hsl(var(--foreground) / 0.8)',
  },
  // Vertical space is padding, never margin — here and on every block widget below.
  //
  // CodeMirror maps a click to a document position through each line's *border box*, and a margin
  // sits outside that box: a heading with `margin-top` takes more room on screen than the height
  // CodeMirror recorded for it, and every position beneath it drifts by the difference. The symptom
  // is a selection landing beside the pointer, and moving further off as soon as a style changes a
  // block's size. (A horizontal margin on an inline widget — the task checkbox — is harmless: it is
  // the height map that positions get read from.)
  '.cm-md-line-heading': { paddingTop: '0.75rem' },
  '.cm-md-line-h1': {
    paddingTop: '1rem',
    paddingBottom: '2px',
    borderBottom: '1px solid hsl(var(--border))',
  },
  '.cm-md-line-h4, .cm-md-line-h5, .cm-md-line-h6': { paddingTop: '0.5rem' },

  '.cm-md-strong': { fontWeight: '700' },
  '.cm-md-emphasis': { fontStyle: 'italic' },
  '.cm-md-strikethrough': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-md-code': {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.9em',
    backgroundColor: 'hsl(var(--muted))',
    borderRadius: '3px',
    padding: '0.1em 0.3em',
  },
  '.cm-md-link': { color: 'hsl(var(--primary))', textDecoration: 'underline' },
  '.cm-md-url': { color: 'hsl(var(--muted-foreground))' },

  // The renderer's blockquote and code block, line by line — a `>` or a bare fence told the reader
  // none of what the preview says with a rule, a tint and a monospaced run.
  '.cm-md-line-quote': {
    borderLeft: '2px solid hsl(var(--primary) / 0.6)',
    backgroundColor: 'hsl(var(--muted) / 0.2)',
    paddingLeft: '0.75rem',
    fontStyle: 'italic',
    color: 'hsl(var(--muted-foreground))',
  },
  '.cm-md-line-fence': {
    backgroundColor: 'hsl(var(--muted) / 0.5)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.9em',
  },

  '.cm-md-task': {
    marginRight: '0.4em',
    verticalAlign: 'middle',
    cursor: 'pointer',
    accentColor: 'hsl(var(--primary))',
  },
  '.cm-md-image': {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '240px',
    borderRadius: '4px',
  },
  // A GitHub alert, as the callout the renderer draws: the marker line becomes the title, and the
  // body keeps its own tint. The text stays text — it is edited in place, not inside a widget.
  '.cm-md-line-alert': {
    borderLeft: '2px solid hsl(var(--primary) / 0.6)',
    backgroundColor: 'hsl(var(--primary) / 0.06)',
    paddingLeft: '0.75rem',
  },
  '.cm-md-line-alert-tip': {
    borderLeftColor: 'hsl(var(--success) / 0.7)',
    backgroundColor: 'hsl(var(--success) / 0.07)',
  },
  '.cm-md-line-alert-warning': {
    borderLeftColor: 'hsl(var(--warning) / 0.7)',
    backgroundColor: 'hsl(var(--warning) / 0.08)',
  },
  '.cm-md-line-alert-caution': {
    borderLeftColor: 'hsl(var(--destructive) / 0.7)',
    backgroundColor: 'hsl(var(--destructive) / 0.07)',
  },
  '.cm-md-alert-title': {
    fontWeight: '500',
    fontSize: '0.9em',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    color: 'hsl(var(--primary))',
  },
  '.cm-md-alert-tip': { color: 'hsl(var(--success))' },
  '.cm-md-alert-warning': { color: 'hsl(var(--warning))' },
  '.cm-md-alert-caution': { color: 'hsl(var(--destructive))' },

  '.cm-md-table': {
    borderCollapse: 'collapse',
    fontSize: '0.95em',
    maxWidth: '100%',
  },
  '.cm-md-table th, .cm-md-table td': {
    border: '1px solid hsl(var(--border))',
    padding: '0.15rem 0.5rem',
    textAlign: 'left',
  },
  '.cm-md-table th': { backgroundColor: 'hsl(var(--muted) / 0.5)', fontWeight: '600' },
  '.cm-md-line-table': {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.9em',
    backgroundColor: 'hsl(var(--muted) / 0.35)',
  },

  '.cm-md-diagram': {
    display: 'block',
    overflowX: 'auto',
    borderRadius: '4px',
    border: '1px solid hsl(var(--border))',
    backgroundColor: 'hsl(var(--card) / 0.6)',
    textAlign: 'center',
  },
  '.cm-md-diagram-failed': {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.9em',
    textAlign: 'left',
    borderColor: 'hsl(var(--destructive) / 0.4)',
  },
  '.cm-md-diagram svg': { maxWidth: '100%', height: 'auto' },

  '.cm-md-rule': {
    display: 'block',
    height: '0',
    border: 'none',
    borderTop: '1px solid hsl(var(--border))',
  },
})

/** The extension pair to hand to an `EditorView`. */
export function markdownLivePreview(options: MarkdownDecorationOptions = {}): Extension {
  return [livePreviewPlugin(options), livePreviewTheme]
}
