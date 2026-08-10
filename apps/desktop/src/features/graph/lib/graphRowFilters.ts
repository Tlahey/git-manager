import type { GitGraphNode } from '@git-manager/git-types'
import { isSyntheticRow, isWipRow } from './syntheticRows'

/**
 * Which rows the graph's two filters keep fully visible.
 *
 * Both return `null` for "filter inactive" rather than "every row", and that distinction is the
 * whole contract: `GitGraph` dims a row only when a filter is *active and unmatched*, so a `null`
 * has to stay distinguishable from a list that happens to contain everything. Returning an empty
 * array on an inactive filter would dim the entire graph.
 *
 * Neither removes rows from the graph — the column and connection shape is computed over the full
 * history, and a search that hid commits would distort the lanes the remaining ones depend on.
 */

/**
 * OIDs matching a free-text search across a commit's subject, body, author name/email and oid.
 *
 * The synthetic rows have no commit to search, so they match on what they *are*: typing `wip` or
 * `conflict` finds them. Anything else leaves them unmatched, and therefore dimmed, like any other
 * non-matching row.
 */
export function matchCommitSearch(nodes: GitGraphNode[], searchQuery?: string): string[] | null {
  const search = searchQuery?.trim().toLowerCase() ?? ''
  if (!search) return null
  return nodes
    .filter((node) => {
      if (isWipRow(node.commit.oid)) return 'wip'.includes(search)
      if (node.commit.oid === 'CONFLICT') return 'conflict'.includes(search)
      const { commit } = node
      const haystack = [
        commit.subject,
        commit.body,
        commit.author.name,
        commit.author.email,
        commit.oid,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(search)
    })
    .map((node) => node.commit.oid)
}

/**
 * OIDs kept visible by the author column's filter — a row matches when its author's email is in
 * the selected set.
 *
 * Every synthetic row is always included: a WIP or conflict row has no author, and dimming the
 * user's own uncommitted work because they filtered on somebody else reads as a bug rather than a
 * filter.
 */
export function matchSelectedAuthors(
  nodes: GitGraphNode[],
  selectedAuthorEmails: Set<string>
): string[] | null {
  if (selectedAuthorEmails.size === 0) return null
  return nodes
    .filter((node) => {
      if (isSyntheticRow(node.commit.oid)) return true
      return selectedAuthorEmails.has((node.commit.author?.email ?? '').trim().toLowerCase())
    })
    .map((node) => node.commit.oid)
}
