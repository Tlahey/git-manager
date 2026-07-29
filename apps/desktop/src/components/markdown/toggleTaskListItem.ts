/**
 * A rendered task-list checkbox has no state of its own: it is a view of one line of markdown, and
 * ticking it means rewriting that line in the source the document was rendered from.
 *
 * The line number comes from the list item's own position, which survives remark → rehype → the
 * sanitizer (see `MarkdownRenderer`), so it points at the line the marker was written on. The
 * pattern is re-checked here anyway: the source may have moved on since it was rendered (a
 * concurrent edit on GitHub), and a blind rewrite of line N would then corrupt whatever now sits
 * there. A line that no longer holds a task marker yields `null` — the caller writes nothing.
 */

/** The task marker of a GFM list item: the bullet (or ordered marker), then `[ ]` / `[x]`. */
const TASK_ITEM = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\])/

/**
 * Rewrite the task item on `line` (1-based) to `checked`.
 *
 * Returns the full new document, or `null` when nothing should be written — either the line isn't a
 * task item any more, or it already carries the requested state.
 */
export function toggleTaskListItem(
  content: string,
  line: number,
  checked: boolean
): string | null {
  const lines = content.split('\n')
  const index = line - 1
  const target = lines[index]
  if (target === undefined) return null

  const marker = TASK_ITEM.exec(target)
  if (!marker) return null

  const [matched, prefix, state, suffix] = marker
  if ((state !== ' ') === checked) return null

  lines[index] = `${prefix}${checked ? 'x' : ' '}${suffix}${target.slice(matched.length)}`
  return lines.join('\n')
}
