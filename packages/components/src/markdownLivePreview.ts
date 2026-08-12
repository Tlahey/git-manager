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

/**
 * Where a hidden marker really ends: a heading's `#` is followed by a space that belongs to the
 * syntax, not to the title. Leaving it visible indents every heading by one space — which is
 * exactly as wide as the gap it leaves, and reads as a broken alignment against the preview.
 */
function hiddenTo(state: EditorState, name: string, to: number): number {
  if (name !== 'HeaderMark') return to
  const rest = state.doc.sliceString(to, state.doc.lineAt(to).to)
  return to + (rest.length - rest.trimStart().length)
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

        if (node.name === 'Blockquote') {
          for (let pos = node.from; pos <= node.to;) {
            const line = state.doc.lineAt(pos)
            decorations.push(Decoration.line({ class: 'cm-md-line-quote' }).range(line.from))
            pos = line.to + 1
          }
        }

        const heading = node.name.match(HEADING)
        if (heading) {
          // The line carries what belongs to the block — the rule under an H1, the space above a
          // heading — since an inline mark is only ever as wide as its own text.
          const line = state.doc.lineAt(node.from)
          decorations.push(
            Decoration.line({ class: `cm-md-line-heading cm-md-line-h${heading[1]}` }).range(
              line.from
            )
          )
        }

        const styleClass = heading ? `cm-md-heading cm-md-h${heading[1]}` : STYLED_NODES[node.name]
        if (styleClass) {
          decorations.push(Decoration.mark({ class: styleClass }).range(node.from, node.to))
        }

        const hideable =
          HIDDEN_MARKS.has(node.name) || isLinkTarget(node.name, node.node.parent?.name)
        if (hideable && !editing.has(state.doc.lineAt(node.from).number)) {
          decorations.push(
            Decoration.replace({}).range(node.from, hiddenTo(state, node.name, node.to))
          )
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
  // Sized and weighted like `MarkdownRenderer`'s headings, in `em` so both stay in step whatever
  // font size the surface gives the editor: 1.5em over the app's 12px body is its `text-lg`, and so
  // on down. The rule under an H1 is the renderer's `border-b`, and the reason this pairing is
  // worth keeping: a heading that changes shape between the two tabs reads as a bug.
  '.cm-md-heading': { lineHeight: '1.6' },
  '.cm-md-h1': { fontSize: '1.5em', fontWeight: '800' },
  '.cm-md-h2': { fontSize: '1.333em', fontWeight: '700', color: 'hsl(var(--foreground) / 0.9)' },
  '.cm-md-h3': { fontSize: '1.167em', fontWeight: '600', color: 'hsl(var(--foreground) / 0.85)' },
  '.cm-md-h4, .cm-md-h5, .cm-md-h6': {
    fontSize: '1em',
    fontWeight: '600',
    color: 'hsl(var(--foreground) / 0.8)',
  },
  '.cm-md-line-heading': { marginTop: '0.75rem' },
  '.cm-md-line-h1': {
    marginTop: '1rem',
    paddingBottom: '2px',
    borderBottom: '1px solid hsl(var(--border))',
  },
  '.cm-md-line-h4, .cm-md-line-h5, .cm-md-line-h6': { marginTop: '0.5rem' },
  // The renderer's blockquote, line by line — a `>` alone told the reader nothing the preview
  // didn't say with a rule and a tint.
  '.cm-md-line-quote': {
    borderLeft: '2px solid hsl(var(--primary) / 0.6)',
    backgroundColor: 'hsl(var(--muted) / 0.2)',
    paddingLeft: '0.75rem',
    fontStyle: 'italic',
    color: 'hsl(var(--muted-foreground))',
  },
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
