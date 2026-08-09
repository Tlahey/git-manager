import { useMemo } from 'react'
import useSWR from 'swr'
import { useGithubAccount } from '../../../hooks/useGithubAccount'
import { fetchIssuesByQuery } from '../../../api/github.api'
import { firstGitHubOwnerRepo } from '../../../lib/githubRemote'
import type { IssueFilter } from '../stores/issueFilters.store'
import type { MockIssue } from '../../../app/pull-requests/types'

export interface UseRepoIssuesOptions {
  remoteUrls: string[]
  githubToken?: string
  /** The saved filters to resolve, in display order — one sub-group each. */
  filters: IssueFilter[]
  enabled?: boolean
}

/** One saved filter and the issues it currently matches. */
export interface IssueFilterGroup {
  filter: IssueFilter
  issues: MockIssue[]
  /** GitHub's own message when *this* filter's query failed (bad qualifier, rate limit…). */
  error: string | null
}

export interface UseRepoIssuesResult {
  /** One group per filter, in the filters' order — always the same length as `filters`. */
  groups: IssueFilterGroup[]
  /** Every issue matched by any filter, de-duplicated (the filters overlap by design). */
  allIssues: MockIssue[]
  isGithub: boolean
  /** Whether a GitHub account (or an explicit `githubToken`) backs the queries — see below. */
  isConnected: boolean
  isLoading: boolean
  error: Error | null
  ownerRepo: { owner: string; repo: string } | null
  /** Revalidate every filter — e.g. right after opening a new issue from the sidebar. */
  refresh: () => void
}

/**
 * The issues of the repository currently open in the app, resolved from its first GitHub remote and
 * split into the user's saved filters (see `features/graph/stores/issueFilters.store.ts`).
 *
 * Every filter is one GitHub search request, and the whole set is fetched in a single SWR entry
 * rather than one hook per filter: the filter list is user-editable at runtime, so a hook per filter
 * would change the number of hooks between renders. A filter whose query GitHub rejects reports the
 * failure on its own group instead of failing the batch — a typo in one saved view must not blank
 * out the others.
 *
 * Nothing is queried without a token: GitHub's search API rejects an anonymous caller outright, so
 * every saved view of a signed-out user reported the transport's own failure ("Load failed") as if
 * the *query* had been wrong. `isConnected` is what the sidebar renders "connect an account" from.
 *
 * Kept separate from {@link useGitHubRepoIssues}, which searches across every repo *added* to the
 * app for the Launchpad: this one is scoped to a single repo. Mirrors {@link usePullRequests}, which
 * resolves its repo the same way.
 */
export function useRepoIssues({
  remoteUrls,
  githubToken,
  filters,
  enabled = true,
}: UseRepoIssuesOptions): UseRepoIssuesResult {
  const account = useGithubAccount()
  const resolvedToken = githubToken || account.token || undefined
  const isConnected = !!resolvedToken

  const ownerRepo = firstGitHubOwnerRepo(remoteUrls)
  const isGithub = ownerRepo !== null

  // Only the queries belong in the key: renaming or reordering a filter changes what is displayed,
  // not what GitHub would return, and must not cost a round-trip per keystroke.
  const queriesKey = filters.map((f) => `${f.id} ${f.query}`).join('\n')

  const swrKey =
    enabled && isGithub && isConnected && ownerRepo && filters.length > 0
      ? ([
          'repo-issue-filters',
          ownerRepo.owner,
          ownerRepo.repo,
          resolvedToken,
          queriesKey,
        ] as const)
      : null

  const { data, error, mutate } = useSWR<IssueFilterGroup[], Error>(
    swrKey,
    async () => {
      const { owner, repo } = ownerRepo as { owner: string; repo: string }
      return Promise.all(
        filters.map(async (filter) => {
          try {
            const issues = await fetchIssuesByQuery(owner, repo, filter.query, resolvedToken)
            return { filter, issues, error: null }
          } catch (err) {
            return { filter, issues: [], error: String(err) }
          }
        })
      )
    },
    { refreshInterval: 60_000, dedupingInterval: 10_000 }
  )

  // Re-derive the groups from the *current* filters rather than returning the fetched array as-is:
  // a rename or a reorder has to show immediately, and neither is worth a refetch.
  const groups = useMemo(() => {
    const byId = new Map((data ?? []).map((g) => [g.filter.id, g]))
    return filters.map((filter) => {
      const fetched = byId.get(filter.id)
      return { filter, issues: fetched?.issues ?? [], error: fetched?.error ?? null }
    })
  }, [data, filters])

  const allIssues = useMemo(() => {
    const seen = new Map<string, MockIssue>()
    for (const group of groups) {
      for (const issue of group.issues) if (!seen.has(issue.id)) seen.set(issue.id, issue)
    }
    return Array.from(seen.values())
  }, [groups])

  return {
    groups,
    allIssues,
    isGithub,
    isConnected,
    isLoading: !data && !error && swrKey !== null,
    error: error || null,
    ownerRepo,
    refresh: () => void mutate(),
  }
}
