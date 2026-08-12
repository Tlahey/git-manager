import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import { Decoration, type DecorationSet } from '@codemirror/view'
import {
  AlertTitleWidget,
  DiagramWidget,
  ImageWidget,
  RuleWidget,
  TableWidget,
  TaskCheckboxWidget,
} from './markdownWidgets'

/**
 * What the live-preview layer paints over a markdown document, node by node.
 *
 * One rule decides everything here, and keeping it one rule is what makes the editor predictable:
 * **the source of a block is shown whenever the caret is on its line, and its rendering the rest of
 * the time.** Markers, images and rules all obey it, so "how do I edit that?" always has the same
 * answer — put the cursor in it.
 *
 * The two exceptions are the ones where the syntax *is* the rendering rather than noise around it:
 * a list bullet, a quote's `>`, and a task's checkbox, which stays a checkbox even on the line being
 * edited because ticking it is the whole gesture.
 */

export interface MarkdownDecorationOptions {
  /**
   * Turns a markdown image path into something the webview can load — a repository-relative
   * attachment, in practice. Without it images stay as their source text, since guessing at paths
   * is the app's business and not this package's.
   */
  resolveImageSrc?: (src: string) => string
  /** The translated name of a GitHub alert kind (`note`, `warning`, …) for its callout title.
   * Without it the kind's own word is shown, which is right for a package that holds no copy. */
  alertLabel?: (kind: string) => string
  /** Renders a fenced diagram to SVG. Without it a ```mermaid block stays the source it already is,
   * which is what a package with no diagram engine should do. */
  renderDiagram?: (code: string) => Promise<string | null>
}

/** A blockquote is a GitHub alert when its first line is nothing but the marker. */
const ALERT = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/

/** Nodes whose whole range gets a style. Heading levels are handled separately. */
const STYLED_NODES: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-emphasis',
  Strikethrough: 'cm-md-strikethrough',
  InlineCode: 'cm-md-code',
  Link: 'cm-md-link',
  URL: 'cm-md-url',
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
 * target. The same `URL` node stands on its own for a bare autolink, where hiding it would erase the
 * only thing on screen.
 */
function isLinkTarget(name: string, parent: string | undefined): boolean {
  return name === 'URL' && (parent === 'Link' || parent === 'Image')
}

/**
 * Where a hidden marker really ends: a heading's `#` is followed by a space that belongs to the
 * syntax, not to the title. Leaving it visible indents every heading by one space — exactly as wide
 * as the gap it leaves, and reads as a broken alignment against the preview.
 */
function hiddenTo(state: EditorState, name: string, to: number): number {
  if (name !== 'HeaderMark') return to
  const rest = state.doc.sliceString(to, state.doc.lineAt(to).to)
  return to + (rest.length - rest.trimStart().length)
}

/** The lines any cursor or selection touches — where the source is shown. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let line = first; line <= last; line += 1) lines.add(line)
  }
  return lines
}

/** `![alt](src)` split back into its two halves, straight from the source text. */
function imageParts(source: string): { alt: string; src: string } | null {
  const match = source.match(/^!\[([^\]]*)\]\(([^)\s]+)/)
  return match ? { alt: match[1], src: match[2] } : null
}

/** Adds one line decoration per line a block spans. */
function eachLine(state: EditorState, from: number, to: number, className: string) {
  const decorations: Range<Decoration>[] = []
  for (let pos = from; pos <= to;) {
    const line = state.doc.lineAt(pos)
    decorations.push(Decoration.line({ class: className }).range(line.from))
    pos = line.to + 1
  }
  return decorations
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
  ranges: readonly { from: number; to: number }[] = [{ from: 0, to: state.doc.length }],
  options: MarkdownDecorationOptions = {}
): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const editing = activeLines(state)
  const isEditing = (pos: number) => editing.has(state.doc.lineAt(pos).number)
  const isEditingBlock = (from: number, to: number) => {
    const first = state.doc.lineAt(from).number
    const last = state.doc.lineAt(to).number
    for (let line = first; line <= last; line += 1) if (editing.has(line)) return true
    return false
  }
  // Ranges already replaced by a widget. CodeMirror rejects one replacement nested in another, and
  // a table's own cells would otherwise go on emitting hidden markers underneath the drawn table.
  const drawn: [number, number][] = []
  const isDrawn = (pos: number) => drawn.some(([from, to]) => pos >= from && pos < to)

  for (const range of ranges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        if (node.to === node.from) return

        if (node.name === 'Image' && options.resolveImageSrc && !isEditing(node.from)) {
          const parts = imageParts(state.doc.sliceString(node.from, node.to))
          if (parts) {
            decorations.push(
              Decoration.replace({
                widget: new ImageWidget(options.resolveImageSrc(parts.src), parts.alt),
              }).range(node.from, node.to)
            )
            // Nothing inside an image is left to decorate, and a nested replace over a replaced
            // range is not a thing CodeMirror accepts.
            return false
          }
        }

        if (node.name === 'TaskMarker') {
          const checked = state.doc.sliceString(node.from, node.to).toLowerCase() === '[x]'
          decorations.push(
            Decoration.replace({
              widget: new TaskCheckboxWidget(node.from, node.to, checked),
            }).range(node.from, node.to)
          )
          return false
        }

        if (node.name === 'HorizontalRule' && !isEditing(node.from)) {
          decorations.push(
            Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to)
          )
          return false
        }

        if (node.name === 'FencedCode') {
          const source = state.doc.sliceString(node.from, node.to)
          const diagram = source.match(/^```mermaid\s*\n([\s\S]*?)\n?```\s*$/)
          if (diagram && options.renderDiagram && !isEditingBlock(node.from, node.to)) {
            decorations.push(
              Decoration.replace({
                widget: new DiagramWidget(diagram[1], options.renderDiagram),
              }).range(node.from, node.to)
            )
            drawn.push([node.from, node.to])
            return false
          }
          decorations.push(...eachLine(state, node.from, node.to, 'cm-md-line-fence'))
        }

        if (node.name === 'Table') {
          if (!isEditingBlock(node.from, node.to)) {
            decorations.push(
              Decoration.replace({
                widget: new TableWidget(state.doc.sliceString(node.from, node.to)),
              }).range(node.from, node.to)
            )
            drawn.push([node.from, node.to])
            return false
          }
          // Being edited: the source stays, but reads as a table rather than as prose.
          decorations.push(...eachLine(state, node.from, node.to, 'cm-md-line-table'))
        }

        if (node.name === 'Blockquote') {
          const first = state.doc.lineAt(node.from)
          const alert = first.text.match(ALERT)
          const kind = alert ? alert[1].toLowerCase() : null

          decorations.push(
            ...eachLine(
              state,
              node.from,
              node.to,
              kind ? `cm-md-line-alert cm-md-line-alert-${kind}` : 'cm-md-line-quote'
            )
          )

          if (kind && !isEditing(first.from)) {
            decorations.push(
              Decoration.replace({
                widget: new AlertTitleWidget(kind, options.alertLabel?.(kind) ?? kind),
              }).range(first.from, first.to)
            )
            drawn.push([first.from, first.to])
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
        if (hideable && !isEditing(node.from) && !isDrawn(node.from)) {
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
