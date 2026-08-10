import { normalizeForSearch } from '../../../lib/highlightMatch'
import type { LocalSection } from '../sections'

/**
 * The side panel's quick search.
 *
 * A page is matched on its label *plus* a set of localized synonyms
 * (`settings.search.keywords.<id>`), so "terminal" or "couleur" surfaces the Personnalisation page
 * even though neither word is in its name. Matching runs through `normalizeForSearch`, which strips
 * accents — without it, French search is a trap: a user typing "personnalisation" would miss a page
 * called "Personnalisation" the moment either side carried an accent.
 */

/**
 * The keyword id each Repository page borrows. The two that mirror a global page reuse its
 * keywords rather than duplicating them; the three repo-only ones have their own.
 */
export const LOCAL_KEYWORD_ID: Record<LocalSection, string> = {
  gitflow: 'gitflow',
  appearance: 'ui_customization',
  ai_commit: 'ai_commit',
  worktree: 'worktree',
  run: 'run',
}

/**
 * Builds the predicate the side panel filters its entries with. An empty query matches everything,
 * which is what keeps "not searching" and "searching for nothing" the same state.
 */
/** The query as the pages themselves receive it — normalized once, here, so the side panel's
 *  filtering and each page's own highlighting can never disagree about what was typed. */
export function normalizeQuery(query: string): string {
  return normalizeForSearch(query.trim())
}

export function createTabMatcher(query: string, t: (key: string) => string) {
  const normalized = normalizeQuery(query)
  return (label: string, keywordsKey: string): boolean =>
    normalized === '' || normalizeForSearch(`${label} ${t(keywordsKey)}`).includes(normalized)
}
