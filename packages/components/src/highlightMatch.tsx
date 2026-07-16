import type { ReactNode } from 'react'

/**
 * Splits `text` into plain segments and `<mark>`-wrapped matches of every occurrence of `query`
 * (case-insensitive). Returns `text` unchanged when `query` is empty or doesn't match, so callers
 * can pass the result straight into JSX without a separate empty-query guard.
 */
export function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = q.toLowerCase()

  let matchIndex = lowerText.indexOf(lowerQuery)
  if (matchIndex === -1) return text

  const parts: ReactNode[] = []
  let cursor = 0
  let key = 0

  while (matchIndex !== -1) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex))
    const end = matchIndex + q.length
    parts.push(
      <mark key={key++} className="rounded-[2px] bg-primary/30 text-inherit">
        {text.slice(matchIndex, end)}
      </mark>
    )
    cursor = end
    matchIndex = lowerText.indexOf(lowerQuery, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))

  return parts
}
