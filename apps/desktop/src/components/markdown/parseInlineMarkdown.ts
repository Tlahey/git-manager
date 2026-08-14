/**
 * A one-line subset of markdown, parsed into nodes a caller can render inside its own element.
 *
 * Deliberately *not* `MarkdownRenderer`: that one parses a whole document through remark/rehype and
 * mounts a highlighter for every fenced block, which is the right cost for a README or a review and
 * an absurd one for a board card's title — a column can hold fifty of them, and none of them wants
 * a `<p>`, a heading or a list. What is left is what a title actually contains: emphasis, inline
 * code, strikethrough, and the occasional link whose text is the only part worth showing.
 *
 * Anything with no closing delimiter stays as it was written, so `2 * 3` and `snake_case` come out
 * verbatim rather than half-swallowed.
 */

export type InlineMarkdownNode =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: InlineMarkdownNode[] }
  | { kind: 'em'; children: InlineMarkdownNode[] }
  | { kind: 'del'; children: InlineMarkdownNode[] }

/** Characters a backslash may escape — the markdown punctuation set, not every character. */
const ESCAPABLE = /[\\`*_~[\]()#+\-.!>]/
const EMPHASIS = new Set(['*', '_', '~'])
/** Letters and digits, for the intraword rule that keeps `snake_case_name` intact. */
const WORD = /[\p{L}\p{N}]/u

export function parseInlineMarkdown(source: string): InlineMarkdownNode[] {
  if (!source) return []
  return parseRange(source, 0, source.length)
}

/** How many times the character at `index` repeats, without running past `to`. */
function runLength(source: string, index: number, to: number): number {
  const char = source[index]
  let end = index
  while (end < to && source[end] === char) end += 1
  return end - index
}

function parseRange(source: string, from: number, to: number): InlineMarkdownNode[] {
  const nodes: InlineMarkdownNode[] = []
  let pending = ''
  let i = from

  function flush() {
    if (pending) {
      nodes.push({ kind: 'text', text: pending })
      pending = ''
    }
  }

  while (i < to) {
    const char = source[i]

    if (char === '\\' && i + 1 < to && ESCAPABLE.test(source[i + 1])) {
      pending += source[i + 1]
      i += 2
      continue
    }

    if (char === '`') {
      const code = matchCode(source, i, to)
      if (code) {
        flush()
        nodes.push({ kind: 'code', text: code.text })
        i = code.end
        continue
      }
    }

    // An image is a link with a leading `!`; there is nothing to show of it in one line but its alt
    // text, so it degrades to that rather than to a broken thumbnail.
    if (char === '!' && source[i + 1] === '[') {
      const image = matchLink(source, i + 1, to)
      if (image) {
        pending += source.slice(image.labelStart, image.labelEnd)
        i = image.end
        continue
      }
    }

    // The label, not an anchor: the card this renders inside is itself the click target, and a link
    // within it would swallow the click that opens the card.
    if (char === '[') {
      const link = matchLink(source, i, to)
      if (link) {
        flush()
        nodes.push(...parseRange(source, link.labelStart, link.labelEnd))
        i = link.end
        continue
      }
    }

    if (EMPHASIS.has(char)) {
      const emphasis = matchEmphasis(source, i, to)
      if (emphasis) {
        flush()
        nodes.push(emphasis.node)
        i = emphasis.end
        continue
      }
    }

    pending += char
    i += 1
  }

  flush()
  return nodes
}

/** A code span: a run of n backticks closed by a run of exactly n, per CommonMark. */
function matchCode(
  source: string,
  start: number,
  to: number
): { text: string; end: number } | null {
  const fence = runLength(source, start, to)
  let i = start + fence
  while (i < to) {
    if (source[i] !== '`') {
      i += 1
      continue
    }
    const run = runLength(source, i, to)
    if (run === fence) {
      const raw = source.slice(start + fence, i)
      // CommonMark strips one space either side, so `` ` `` can hold a literal backtick.
      const text = raw.startsWith(' ') && raw.endsWith(' ') && raw.trim() ? raw.slice(1, -1) : raw
      return { text, end: i + fence }
    }
    i += run
  }
  return null
}

interface LinkMatch {
  labelStart: number
  labelEnd: number
  end: number
}

/** `[label](target)` starting at the `[`. Nested brackets in the label are not supported — a title
 * that needs them is past the point where this rendering helps. */
function matchLink(source: string, start: number, to: number): LinkMatch | null {
  const labelEnd = source.indexOf(']', start + 1)
  if (labelEnd === -1 || labelEnd >= to || source[labelEnd + 1] !== '(') return null
  const targetEnd = source.indexOf(')', labelEnd + 2)
  if (targetEnd === -1 || targetEnd >= to) return null
  return { labelStart: start + 1, labelEnd, end: targetEnd + 1 }
}

/**
 * An emphasis run and its closer. `***x***` is taken as a run of three rather than two plus a
 * leftover, so the odd asterisk never survives into the output — which is the whole point of
 * rendering the title instead of printing it.
 */
function matchEmphasis(
  source: string,
  start: number,
  to: number
): { node: InlineMarkdownNode; end: number } | null {
  const char = source[start]
  const run = runLength(source, start, to)
  const length = char === '~' ? (run === 2 ? 2 : 0) : Math.min(run, 3)
  if (!length) return null

  const contentStart = start + length
  // An opener is glued to what it emphasises: `a * b` is a multiplication, not an italic.
  if (contentStart >= to || /\s/.test(source[contentStart])) return null
  // Underscores inside a word are an identifier, not emphasis (asterisks are not: `a**b**c` is).
  if (char === '_' && start > 0 && WORD.test(source[start - 1])) return null

  const closer = findCloser(source, contentStart, to, char, length)
  if (closer === -1) return null

  const children = parseRange(source, contentStart, closer)
  const node: InlineMarkdownNode =
    length === 3
      ? { kind: 'strong', children: [{ kind: 'em', children }] }
      : char === '~'
        ? { kind: 'del', children }
        : length === 2
          ? { kind: 'strong', children }
          : { kind: 'em', children }
  return { node, end: closer + length }
}

/** The matching closing run: same character, same length, not preceded by a space, and not sitting
 * inside a code span (`` *a* and `2*3` `` must close on the second asterisk, not the third). */
function findCloser(
  source: string,
  from: number,
  to: number,
  char: string,
  length: number
): number {
  let i = from
  while (i < to) {
    if (source[i] === '`') {
      const code = matchCode(source, i, to)
      i = code ? code.end : i + runLength(source, i, to)
      continue
    }
    if (source[i] !== char) {
      i += 1
      continue
    }
    const run = runLength(source, i, to)
    // A run of a different length belongs to another pair — skip it whole, so the outer `*` of
    // `*a **b** c*` closes on the final asterisk rather than inside the inner pair.
    if (run === length && !/\s/.test(source[i - 1])) {
      if (char !== '_' || i + run >= to || !WORD.test(source[i + run])) return i
    }
    i += run
  }
  return -1
}
