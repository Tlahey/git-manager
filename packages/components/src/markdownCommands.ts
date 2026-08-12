import {
  insertBlock,
  insertInline,
  mapLines,
  toggleLinePrefix,
  toggleWrap,
  wrapFence,
  type MarkdownEdit,
  type MarkdownSelection,
} from './markdownEdit'

/**
 * Every formatting action the editor toolbar offers, as a pure function from the current selection
 * to the edit that applies it. The set mirrors GitHub's "basic writing and formatting syntax", so a
 * user coming from github.com finds the same actions under the same keyboard shortcuts.
 *
 * Two conventions hold across the whole registry, and both are what make the toolbar feel like an
 * editor rather than a snippet inserter:
 *  - every command is a *toggle* where the syntax allows one — bold applied twice unwraps, a
 *    heading applied at its own level clears it, an alert replaces the previous alert marker rather
 *    than nesting a second quote inside the first;
 *  - a command with nothing selected still does something useful: it inserts the markers and puts
 *    the caret (or a selected placeholder) where the text goes.
 */
export type MarkdownCommandId =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'quote'
  | 'code'
  | 'codeBlock'
  | 'link'
  | 'image'
  | 'mention'
  | 'bulletList'
  | 'numberedList'
  | 'taskList'
  | 'alertNote'
  | 'alertTip'
  | 'alertImportant'
  | 'alertWarning'
  | 'alertCaution'
  | 'underline'
  | 'subscript'
  | 'superscript'
  | 'escape'
  | 'table'
  | 'horizontalRule'
  | 'details'
  | 'footnote'
  | 'issueReference'
  | 'emoji'
  | 'mermaid'
  | 'math'
  | 'hiddenComment'

/** A command returns `null` when it has nothing to do — only `escape` does, on an empty selection. */
export type MarkdownCommand = (state: MarkdownSelection) => MarkdownEdit | null

const HEADING_MARKER = /^(#{1,6})\s/
const ALERT_MARKER = /^>\s*\[![A-Z]+\]\s*$/
const ORDERED_MARKER = /^\d+\.\s/

/** Sets, or clears, a heading of exactly this level on every touched line. Any other level is
 * replaced rather than stacked, so H2 → H3 is one click. */
function heading(level: number): MarkdownCommand {
  const marker = `${'#'.repeat(level)} `
  return (state) =>
    mapLines(state, (lines) =>
      lines.map((line) => {
        const current = line.match(HEADING_MARKER)
        const body = line.replace(HEADING_MARKER, '')
        return current?.[1].length === level ? body : marker + body
      })
    )
}

/** Numbers every touched line from 1, or strips the numbering when all of them already carry it. */
function numberedList(state: MarkdownSelection): MarkdownEdit {
  return mapLines(state, (lines) => {
    const allNumbered = lines.every((line) => ORDERED_MARKER.test(line))
    return lines.map((line, index) =>
      allNumbered
        ? line.replace(ORDERED_MARKER, '')
        : `${index + 1}. ${line.replace(ORDERED_MARKER, '')}`
    )
  })
}

/** Quotes the touched lines and stamps them with a GitHub alert marker, dropping any marker already
 * there so switching from note to warning swaps the kind instead of stacking two. */
function alert(kind: string): MarkdownCommand {
  return (state) =>
    mapLines(state, (lines) => [
      `> [!${kind}]`,
      ...lines
        .filter((line) => !ALERT_MARKER.test(line))
        .map((line) => `> ${line.replace(/^>\s?/, '')}`),
    ])
}

/** `[text](url)` with `url` selected, or — when the selection *is* a URL, which is the paste-then-
 * click case — `[](url)` with the caret in the empty label. */
function link(isImage: boolean): MarkdownCommand {
  return (state) => {
    const selected = state.value.slice(state.selectionStart, state.selectionEnd)
    const bang = isImage ? '!' : ''
    if (/^https?:\/\/\S+$/.test(selected)) {
      return insertInline(state, `${bang}[](${selected})`, bang.length + 1)
    }
    return insertInline(state, `${bang}[${selected}](url)`, bang.length + selected.length + 3, 3)
  }
}

/**
 * Inserts `[^n]` at the caret and its definition at the end of the document, in one edit spanning
 * everything between the two — a single edit rather than two so ⌘Z undoes the footnote as one
 * action. `n` is the first free number, so a second footnote doesn't collide with the first.
 */
function footnote(state: MarkdownSelection): MarkdownEdit {
  let index = 1
  while (state.value.includes(`[^${index}]`)) index += 1
  const tag = `[^${index}]`
  const tail = state.value.slice(state.selectionStart)
  const separator = state.value.endsWith('\n') ? '\n' : '\n\n'
  const text = `${tag}${tail}${separator}${tag}: `
  const caret = state.selectionStart + text.length
  return {
    from: state.selectionStart,
    to: state.value.length,
    text,
    selectionStart: caret,
    selectionEnd: caret,
  }
}

/** Backslash-escapes the markdown punctuation in the selection — for pasting a literal `*` or `_`
 * into a ticket without it turning into emphasis. */
function escapeSelection(state: MarkdownSelection): MarkdownEdit | null {
  const selected = state.value.slice(state.selectionStart, state.selectionEnd)
  if (!selected) return null
  const escaped = selected.replace(/([\\`*_{}[\]()#+\-.!|>~])/g, '\\$1')
  return {
    from: state.selectionStart,
    to: state.selectionEnd,
    text: escaped,
    selectionStart: state.selectionStart,
    selectionEnd: state.selectionStart + escaped.length,
  }
}

const TABLE = '| Column | Column |\n| --- | --- |\n| Cell | Cell |\n'
const DETAILS = '<details>\n<summary>Summary</summary>\n\nContent\n\n</details>\n'
const MERMAID_TEMPLATE = 'flowchart TD\n  A[Start] --> B[End]'

export const MARKDOWN_COMMANDS: Record<MarkdownCommandId, MarkdownCommand> = {
  heading1: heading(1),
  heading2: heading(2),
  heading3: heading(3),
  heading4: heading(4),
  heading5: heading(5),
  heading6: heading(6),
  bold: (state) => toggleWrap(state, '**', '**'),
  italic: (state) => toggleWrap(state, '_', '_'),
  strikethrough: (state) => toggleWrap(state, '~~', '~~'),
  quote: (state) => toggleLinePrefix(state, '> '),
  code: (state) => toggleWrap(state, '`', '`'),
  codeBlock: (state) => wrapFence(state),
  link: link(false),
  image: link(true),
  mention: (state) => insertInline(state, '@', 1),
  bulletList: (state) => toggleLinePrefix(state, '- '),
  numberedList,
  taskList: (state) => toggleLinePrefix(state, '- [ ] '),
  alertNote: alert('NOTE'),
  alertTip: alert('TIP'),
  alertImportant: alert('IMPORTANT'),
  alertWarning: alert('WARNING'),
  alertCaution: alert('CAUTION'),
  underline: (state) => toggleWrap(state, '<ins>', '</ins>'),
  subscript: (state) => toggleWrap(state, '<sub>', '</sub>'),
  superscript: (state) => toggleWrap(state, '<sup>', '</sup>'),
  escape: escapeSelection,
  table: (state) => insertBlock(state, TABLE, 2, 6),
  horizontalRule: (state) => insertBlock(state, '\n---\n\n', 6),
  details: (state) => insertBlock(state, DETAILS, 19, 7),
  footnote,
  issueReference: (state) => insertInline(state, '#', 1),
  emoji: (state) => insertInline(state, ':tada:', 1, 4),
  mermaid: (state) => wrapFence(state, 'mermaid', MERMAID_TEMPLATE),
  math: (state) => insertBlock(state, '$$\n\n$$\n', 3),
  hiddenComment: (state) => insertInline(state, '<!--  -->', 5),
}

/**
 * The keyboard shortcuts GitHub binds, so the muscle memory carries over. Modifier-agnostic: the
 * caller matches ⌘ on macOS and Ctrl elsewhere.
 */
export const MARKDOWN_SHORTCUTS: Record<string, MarkdownCommandId> = {
  b: 'bold',
  i: 'italic',
  k: 'link',
  e: 'code',
  'shift+x': 'strikethrough',
  'shift+e': 'codeBlock',
  'shift+l': 'taskList',
  'shift+7': 'numberedList',
  'shift+8': 'bulletList',
  'shift+.': 'quote',
}
