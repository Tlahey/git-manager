/**
 * The text primitives every markdown formatting command is built from — wrapping a selection,
 * prefixing whole lines, inserting a block — expressed as pure functions over a string and a
 * selection range, with no DOM anywhere.
 *
 * Each returns a `MarkdownEdit` rather than the whole rewritten document, and that is the point:
 * `useMarkdownEditor` replays it through `document.execCommand('insertText')`, which needs the
 * range to replace. Handing back a full value instead would force the caller to assign
 * `textarea.value`, and that single assignment costs three things at once — WebKit resets
 * `scrollTop`, the native undo stack is wiped (⌘Z would drop the user's whole draft instead of the
 * bold they just applied), and a controlled React textarea has to be poked to notice. Keeping the
 * edit minimal keeps all three working.
 */

/** A textarea's content and current selection: everything a command needs to decide what to do. */
export interface MarkdownSelection {
  value: string
  selectionStart: number
  selectionEnd: number
}

/** A single replacement, plus where the selection should land once it is applied. */
export interface MarkdownEdit {
  /** Start of the replaced range, in the *current* value. */
  from: number
  /** End of the replaced range, in the *current* value. */
  to: number
  /** What takes its place. */
  text: string
  /** Selection start in the *resulting* value. */
  selectionStart: number
  /** Selection end in the resulting value — equal to `selectionStart` for a bare caret. */
  selectionEnd: number
}

/** Applies an edit to a selection state. Used by the tests, and as the fallback when the browser
 * has no `execCommand` (jsdom, and any engine that ever drops it). */
export function applyEdit(state: MarkdownSelection, edit: MarkdownEdit): MarkdownSelection {
  return {
    value: state.value.slice(0, edit.from) + edit.text + state.value.slice(edit.to),
    selectionStart: edit.selectionStart,
    selectionEnd: edit.selectionEnd,
  }
}

function edit(
  from: number,
  to: number,
  text: string,
  selectionStart: number,
  selectionEnd = selectionStart
): MarkdownEdit {
  return { from, to, text, selectionStart, selectionEnd }
}

function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Wraps the selection in `prefix`/`suffix`, or unwraps it when it is already wrapped — checked both
 * ways round, since the markers can sit inside the selection (the user selected `**bold**`) or just
 * outside it (they selected `bold` and the stars are already there). Without the second check,
 * clicking bold twice would give `****bold****`.
 */
export function toggleWrap(state: MarkdownSelection, prefix: string, suffix: string): MarkdownEdit {
  const { value, selectionStart: start, selectionEnd: end } = state
  const inner = value.slice(start, end)

  if (
    value.slice(start - prefix.length, start) === prefix &&
    value.slice(end, end + suffix.length) === suffix
  ) {
    const from = start - prefix.length
    return edit(from, end + suffix.length, inner, from, from + inner.length)
  }

  if (
    inner.length >= prefix.length + suffix.length &&
    inner.startsWith(prefix) &&
    inner.endsWith(suffix)
  ) {
    const stripped = inner.slice(prefix.length, inner.length - suffix.length)
    return edit(start, end, stripped, start, start + stripped.length)
  }

  return edit(
    start,
    end,
    prefix + inner + suffix,
    start + prefix.length,
    start + prefix.length + inner.length
  )
}

/** The range of whole lines the selection touches — a partial selection formats its whole line, the
 * way every editor's list and quote buttons behave. */
function lineRange(state: MarkdownSelection): [number, number] {
  const from = state.value.lastIndexOf('\n', state.selectionStart - 1) + 1
  const to = state.value.indexOf('\n', state.selectionEnd)
  return [from, to < 0 ? state.value.length : to]
}

/** Rewrites every line the selection touches, and selects the rewritten block. */
export function mapLines(
  state: MarkdownSelection,
  transform: (lines: string[]) => string[]
): MarkdownEdit {
  const [from, to] = lineRange(state)
  const text = transform(state.value.slice(from, to).split('\n')).join('\n')
  return edit(from, to, text, from, from + text.length)
}

/**
 * Adds `prefix` to every touched line, or strips it from all of them when they all already have it
 * — so the same button turns a list on and off. On a mixed block it prefixes only the lines that
 * lack it, which normalizes the block instead of double-prefixing the ones already in the list.
 */
export function toggleLinePrefix(state: MarkdownSelection, prefix: string): MarkdownEdit {
  const marker = new RegExp(`^${escapeRegExp(prefix)}`)
  return mapLines(state, (lines) => {
    const allPrefixed = lines.every((line) => marker.test(line))
    return lines.map((line) => {
      if (allPrefixed) return line.replace(marker, '')
      return marker.test(line) ? line : prefix + line
    })
  })
}

/**
 * Inserts a multi-line block, opening a new line first when the caret sits mid-line so the block
 * never starts glued to the end of a sentence. `caretOffset`/`caretLength` point at the part the
 * user is meant to overwrite (a table's first cell, a `<summary>`'s title), measured from the start
 * of `text`.
 */
export function insertBlock(
  state: MarkdownSelection,
  text: string,
  caretOffset: number,
  caretLength = 0
): MarkdownEdit {
  const { value, selectionStart: start, selectionEnd: end } = state
  const lineBreak = start > 0 && value[start - 1] !== '\n' ? '\n' : ''
  const caret = start + lineBreak.length + caretOffset
  return edit(start, end, lineBreak + text, caret, caret + caretLength)
}

/** Inserts `text` at the caret, replacing the selection. */
export function insertInline(
  state: MarkdownSelection,
  text: string,
  caretOffset: number,
  caretLength = 0
): MarkdownEdit {
  const caret = state.selectionStart + caretOffset
  return edit(state.selectionStart, state.selectionEnd, text, caret, caret + caretLength)
}

/** Fences the selection — or `template`, when there is nothing selected — as a code block, with the
 * fenced body left selected so it can be typed over. */
export function wrapFence(state: MarkdownSelection, language = '', template = ''): MarkdownEdit {
  const body = state.value.slice(state.selectionStart, state.selectionEnd) || template
  const block = `\`\`\`${language}\n${body}\n\`\`\`\n`
  return insertBlock(state, block, language.length + 4, body.length)
}
