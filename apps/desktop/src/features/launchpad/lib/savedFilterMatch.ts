/**
 * Whether a pull request or an issue satisfies a saved custom view.
 *
 * Every criterion on a `SavedFilter` is optional and they combine with AND, so an empty filter
 * matches everything — that is what makes a freshly created view show the whole list rather than
 * nothing. Text criteria are case-insensitive substring matches, not equality: `authorContains`
 * is spelled "contains" because that is what the editor's field promises.
 *
 * Pure and React-free so the tab that renders the results and the sidebar that counts them can
 * both use it, and so the rules can be tested without mounting either.
 */

import type { SavedFilter } from '../stores/launchpad.store'
import type { MockPR, MockIssue } from '../../../lib/github/types'

const contains = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase())

/** The criteria a PR and an issue share — title, author, repo and labels. */
function matchesCommonCriteria(
  item: { title: string; author: string; repo: string; labels: string[] },
  f: SavedFilter
): boolean {
  if (f.titleContains && !contains(item.title, f.titleContains)) return false
  if (f.authorContains && !contains(item.author, f.authorContains)) return false
  if (f.repo && item.repo !== f.repo) return false
  if (f.labelContains && !item.labels.some((l) => contains(l, f.labelContains!))) return false
  return true
}

export function prMatchesSavedFilter(pr: MockPR, f: SavedFilter): boolean {
  if (!matchesCommonCriteria(pr, f)) return false
  if (f.statuses && f.statuses.length > 0 && !f.statuses.includes(pr.status)) return false
  // `false` and `undefined` both mean "don't filter"; only an explicit `true` narrows the list.
  if (f.needsMyReview === true && !pr.needsMyReview) return false
  return true
}

/** Issues carry no review state and their own `open`/`closed` status is not a `FilterStatus`, so
 * the two PR-only criteria simply do not apply to them. */
export function issueMatchesSavedFilter(issue: MockIssue, f: SavedFilter): boolean {
  return matchesCommonCriteria(issue, f)
}
