import type { MockPR } from './types'

/**
 * Whether a PR matches a free-text query (case-insensitive) across its title, author, repo and
 * number. An empty/whitespace query matches everything — so it can be ANDed with the global
 * Launchpad search without special-casing the empty state.
 */
export function matchesPrSearch(pr: MockPR, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    pr.title.toLowerCase().includes(q) ||
    pr.author.toLowerCase().includes(q) ||
    pr.repo.toLowerCase().includes(q) ||
    String(pr.number).includes(q)
  )
}
