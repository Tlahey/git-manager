/**
 * The Launchpad's own view state — how its lists are sorted and which inner tab is showing.
 *
 * Split from the GitHub view-models in `lib/github/types.ts`: those describe what GitHub returned
 * and are read all over the app, these describe how this page is currently arranged and are read
 * nowhere else.
 */

export type SortKey = 'date' | 'status' | 'author' | 'repo' | 'files'
export type SortDir = 'asc' | 'desc'
export type InnerTab =
  'prs' | 'wip' | 'followed' | 'issues' | 'waiting' | 'snoozed' | 'stats' | 'views'
