/**
 * Which rows the graph greys out.
 *
 * Two filters can be active at once — the commit search and the author column's — and they combine
 * with **OR**: a row stays lit if it matches *either* one, and is dimmed only when every active
 * filter leaves it out. AND would have been the obvious reading and is the wrong one: searching for
 * a word while an author is selected would then show only that author's matching commits, which is
 * an intersection nobody asked for.
 *
 * A drag in progress overrides both. While a ref is being dragged, the only question on screen is
 * "where can this land", so the drag's own set decides alone and the filters are ignored until it
 * ends.
 *
 * Each set is `null` for "this filter is not active" rather than "it matched nothing" — the
 * distinction is what stops an inactive filter from dimming the whole graph (see `graphRowFilters`).
 */
export function isRowDimmed(
  oid: string,
  filters: {
    /** Oids matching the commit search, or `null` when nothing is being searched for. */
    matchSet: Set<string> | null
    /** Oids matching the author filter, or `null` when no author is selected. */
    authorMatchSet: Set<string> | null
    /** Oids a ref being dragged could land on, or `null` when nothing is being dragged. */
    dragHighlightSet: Set<string> | null
  }
): boolean {
  const { matchSet, authorMatchSet, dragHighlightSet } = filters

  if (dragHighlightSet) return !dragHighlightSet.has(oid)

  const searchActive = matchSet !== null
  const authorActive = authorMatchSet !== null
  if (!searchActive && !authorActive) return false

  return !((searchActive && matchSet.has(oid)) || (authorActive && authorMatchSet.has(oid)))
}
