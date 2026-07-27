import type { StoredDailySummary } from '../stores/dailySummary.store'

/**
 * Lexical ranking over the archived briefings — the **shortlister** for the LLM search.
 *
 * It does not face the user. Searching the content is the model's job (see `useSummarySearch`); this
 * only decides which handful of days that model is given to read, which is the job lexical ranking
 * is genuinely good at — narrowing 60 candidates to 12.
 *
 * Pure, dependency-free and local. Two months of short briefings is a few hundred kilobytes: an
 * index would cost more to keep in sync with a folder the user can edit by hand than a linear scan
 * costs to run.
 *
 * Scoring is deliberately simple and explainable: every query term must appear somewhere (AND, not
 * OR — an "or" search over a personal archive returns everything), and a term is worth more in the
 * headline than in a bullet, and more in a whole-word match than inside a longer word.
 */

/** Where a term matched, most valuable first. */
const HEADLINE_WEIGHT = 3
const BULLET_WEIGHT = 1
const REPO_WEIGHT = 2
/** A whole-word hit is what the user meant; a substring hit ("test" in "latest") usually isn't. */
const WHOLE_WORD_BONUS = 2

export interface SummarySearchResult {
  entry: StoredDailySummary
  score: number
  /** The briefing's own lines that matched, for the result list to highlight. */
  snippets: string[]
}

/** Splits a query into lower-cased terms, dropping punctuation and empties. */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((term) => term.length > 0)
}

/** Score of one term against one piece of text, 0 when absent. */
function scoreIn(text: string, term: string, weight: number): number {
  const haystack = text.toLowerCase()
  if (!haystack.includes(term)) return 0
  const wholeWord = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'u').test(
    haystack
  )
  return weight + (wholeWord ? WHOLE_WORD_BONUS : 0)
}

/** Every searchable line of a briefing, headline first. */
function lines(entry: StoredDailySummary): string[] {
  return [entry.summary.headline, ...entry.summary.highlights].filter(
    (line) => line.trim().length > 0
  )
}

/**
 * Ranks `entries` against `query`, best match first.
 *
 * An empty query returns everything in the archive's own order (newest first) rather than nothing —
 * the page opens on the full timeline, and typing narrows it.
 */
export function searchDailySummaries(
  entries: StoredDailySummary[],
  query: string
): SummarySearchResult[] {
  const terms = tokenize(query)
  if (terms.length === 0) {
    return entries.map((entry) => ({ entry, score: 0, snippets: [] }))
  }

  const results: SummarySearchResult[] = []
  for (const entry of entries) {
    const [headline, ...bullets] = lines(entry)
    let total = 0
    const snippets = new Set<string>()

    for (const term of terms) {
      let termScore = scoreIn(headline ?? '', term, HEADLINE_WEIGHT)
      if (termScore > 0 && headline) snippets.add(headline)

      termScore += scoreIn(entry.repoName, term, REPO_WEIGHT)
      // The date is matched as raw text so "2026-07" and "2026-07-21" both work.
      termScore += scoreIn(entry.date, term, REPO_WEIGHT)

      for (const bullet of bullets) {
        const bulletScore = scoreIn(bullet, term, BULLET_WEIGHT)
        if (bulletScore > 0) {
          termScore += bulletScore
          snippets.add(bullet)
        }
      }

      // Every term must land somewhere: one missing term drops the whole briefing.
      if (termScore === 0) {
        total = 0
        break
      }
      total += termScore
    }

    if (total > 0) results.push({ entry, score: total, snippets: Array.from(snippets) })
  }

  return results.sort(
    (a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date)
  )
}
