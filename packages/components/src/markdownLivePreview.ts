import { syntaxTree } from '@codemirror/language'
import type { EditorState, Extension, Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'

/**
 * The "live preview" layer: the document stays plain markdown, and the styling is painted over it —
 * a heading reads as a heading, `**bold**` reads as bold, and the syntax markers vanish everywhere
 * except on the line the caret is on, where they come back so they can be edited.
 *
 * This is what makes formatted editing possible without a second document format. A WYSIWYG editor
 * would parse the markdown into a tree, let the user edit *that*, and serialize it back on save —
 * which reformats parts of the body nobody touched, and loses anything the serializer doesn't model
 * (our alerts, mermaid blocks and raw `<details>` among them). Here the text in the editor *is* the
 * text that gets sent; nothing is ever re-generated.
 */

/** Nodes whose whole range gets a style. Heading levels are handled separately. */
const STYLED_NODES: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-emphasis',
  Strikethrough: 'cm-md-strikethrough',
  InlineCode: 'cm-md-code',
  Link: 'cm-md-link',
  URL: 'cm-md-url',
  FencedCode: 'cm-md-fence',
  CodeText: 'cm-md-fence-text',
}

/**
 * Markers hidden while the caret is elsewhere.
 *
 * `ListMark` and `QuoteMark` are deliberately absent: a bullet and a `>` *are* the rendering, so
 * hiding them would leave a list item indistinguishable from a paragraph.
 */
const HIDDEN_MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'LinkMark',
  'CodeInfo',
])

const HEADING = /^ATXHeading(\d)$/

/**
 * A link's target is hidden with its brackets, leaving only the label — but only when it *is* a
 * target. The same `URL` node stands on its own for a bare autolink, where hiding it would erase
 * the only thing on screen.
 */
function isLinkTarget(name: string, parent: string | undefined): boolean {
  return name === 'URL' && (parent === 'Link' || parent === 'Image')
}

/** The lines any cursor or selection touches — where the markers stay visible. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let line = first; line <= last; line += 1) lines.add(line)
  }
  return lines
}

/**
 * Builds the decoration set for a document.
 *
 * Pure over `EditorState` rather than tied to an `EditorView` so the rules can be tested without a
 * laid-out DOM — jsdom gives every line a height of zero, so a view-based test would compute its
 * decorations over an empty viewport and pass no matter what the rules said.
 */
export function markdownDecorations(
  state: EditorState,
  ranges: readonly { from: number; to: number }[] = [{ from: 0, to: state.doc.length }]
): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const editing = activeLines(state)

  for (const range of ranges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        if (node.to === node.from) return

        const heading = node.name.match(HEADING)
        const styleClass = heading ? `cm-md-heading cm-md-h${heading[1]}` : STYLED_NODES[node.name]
        if (styleClass) {
          decorations.push(Decoration.mark({ class: styleClass }).range(node.from, node.to))
        }

        const hideable =
          HIDDEN_MARKS.has(node.name) || isLinkTarget(node.name, node.node.parent?.name)
        if (hideable && !editing.has(state.doc.lineAt(node.from).number)) {
          decorations.push(Decoration.replace({}).range(node.from, node.to))
        }
      },
    })
  }

  // Sorted on the way in: a parent's style opens before the markers nested inside it, and
  // `Decoration.set` refuses an unordered set.
  return Decoration.set(decorations, true)
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = markdownDecorations(view.state, view.visibleRanges)
    }

    update(update: ViewUpdate) {
      // The selection matters as much as the document here: moving the caret onto a line is what
      // brings that line's markers back.
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = markdownDecorations(update.view.state, update.view.visibleRanges)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

/** Styling for the decorations, in the app's own tokens so it retints with the theme. */
const livePreviewTheme = EditorView.theme({
  '&': { color: 'hsl(var(--foreground))', backgroundColor: 'transparent' },
  '.cm-content': {
    padding: '0.5rem 0.75rem',
    fontFamily: 'inherit',
    caretColor: 'hsl(var(--foreground))',
  },
  '.cm-line': { padding: '0 2px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
  '.cm-placeholder': { color: 'hsl(var(--muted-foreground))' },
  '.cm-md-heading': { fontWeight: '600', lineHeight: '1.6' },
  '.cm-md-h1': { fontSize: '1.5em' },
  '.cm-md-h2': { fontSize: '1.3em' },
  '.cm-md-h3': { fontSize: '1.15em' },
  '.cm-md-h4, .cm-md-h5, .cm-md-h6': { fontSize: '1em' },
  '.cm-md-strong': { fontWeight: '700' },
  '.cm-md-emphasis': { fontStyle: 'italic' },
  '.cm-md-strikethrough': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-md-code, .cm-md-fence-text': {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '0.9em',
    backgroundColor: 'hsl(var(--muted))',
    borderRadius: '3px',
    padding: '0.1em 0.3em',
  },
  '.cm-md-fence': { fontFamily: 'var(--font-mono, monospace)' },
  '.cm-md-link': { color: 'hsl(var(--primary))', textDecoration: 'underline' },
  '.cm-md-url': { color: 'hsl(var(--muted-foreground))' },
})

/** The extension pair to hand to an `EditorView`. */
export function markdownLivePreview(): Extension {
  return [livePreviewPlugin, livePreviewTheme]
}
