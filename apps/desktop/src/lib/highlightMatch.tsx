import type { ReactNode } from 'react'

/** Lowercases and strips diacritics so search matching/highlighting is accent-insensitive. */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/**
 * Wraps the first occurrence of `query` within `text` in a highlight `<mark>`, matched accent- and
 * case-insensitively (so "personnalisation" highlights when searching "personnalis" or "PERSONN").
 * Returns the plain string when the query is empty or absent from `text` — e.g. when the search
 * matched a hidden keyword rather than the visible label, there is nothing to highlight.
 */
export function highlightMatch(text: string, query: string): ReactNode {
  const q = normalizeForSearch(query.trim())
  if (!q) return text

  // Normalizing can change length (a diacritic becomes a separate combining mark we drop), so build
  // the normalized string alongside a map from each normalized-char index back to its source index.
  const indexMap: number[] = []
  let normalized = ''
  for (let i = 0; i < text.length; i++) {
    const nc = normalizeForSearch(text[i])
    for (let j = 0; j < nc.length; j++) {
      normalized += nc[j]
      indexMap.push(i)
    }
  }

  const start = normalized.indexOf(q)
  if (start === -1) return text

  const originalStart = indexMap[start]
  const originalEnd = indexMap[start + q.length - 1] + 1
  return (
    <>
      {text.slice(0, originalStart)}
      <mark className="rounded bg-primary/25 text-foreground">
        {text.slice(originalStart, originalEnd)}
      </mark>
      {text.slice(originalEnd)}
    </>
  )
}
