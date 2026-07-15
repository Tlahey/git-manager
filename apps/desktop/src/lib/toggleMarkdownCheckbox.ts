// Mirrors the fence-aware, line-by-line traversal `Markdown.tsx` uses to render GFM task-list
// checkboxes ("- [ ] todo" / "- [x] done") — must stay in sync with the regex there so a checkbox's
// index always matches what's on screen.
const TASK_ITEM_REGEX = /^(\s*[-*]\s+)\[([ xX])\](\s+.*)$/

/** Flips the Nth GFM task-list checkbox (0-indexed, in document order, skipping fenced code
 * blocks) found in `content` and returns the updated markdown. Out-of-range indices are a no-op. */
export function toggleMarkdownCheckbox(content: string, index: number): string {
  let seen = 0

  const segments = content.split(/(```[\s\S]*?```)/g).map((segment) => {
    if (segment.startsWith('```')) return segment

    return segment
      .split('\n')
      .map((line) => {
        const match = line.match(TASK_ITEM_REGEX)
        if (!match) return line

        const isTarget = seen === index
        seen++
        if (!isTarget) return line

        const checked = match[2].toLowerCase() === 'x'
        return `${match[1]}[${checked ? ' ' : 'x'}]${match[3]}`
      })
      .join('\n')
  })

  return segments.join('')
}
