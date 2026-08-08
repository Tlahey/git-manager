import { useMemo } from 'react'
import useSWR from 'swr'
import type { PullRequest } from '@git-manager/git-types'
import { useGithubAccount } from './useGithubAccount'
import { fetchPullRequestsByQuery } from '../api/github.api'
import { firstGitHubOwnerRepo } from '../lib/githubRemote'
import type { PrFilter } from '../stores/prFilters.store'

export interface UseRepoPrFiltersOptions {
  remoteUrls: string[]
  githubToken?: string
  /** The saved filters to resolve, in display order — one sub-group each. */
  filters: PrFilter[]
  /**
   * The repo's open pull requests as full objects (from `usePullRequests`). Search returns the
   * *issue* representation of a PR, which carries no head/base branch, so every match found here is
   * replaced by its full counterpart when the repo list has it.
   */
  knownPrs: PullRequest[]
  enabled?: boolean
}

/** One saved filter and the pull requests it currently matches. */
export interface PrFilterGroup {
  filter: PrFilter
  prs: PullRequest[]
  /** GitHub's own message when *this* filter's query failed (bad qualifier, rate limit…). */
  error: string | null
}

export interface UseRepoPrFiltersResult {
  /** One group per filter, in the filters' order — always the same length as `filters`. */
  groups: PrFilterGroup[]
  /** Every PR matched by any filter, de-duplicated (the filters overlap by design). */
  allMatched: PullRequest[]
  isGithub: boolean
  /** Whether a GitHub account (or an explicit `githubToken`) backs the queries — see below. */
  isConnected: boolean
  isLoading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * The repository's pull requests split into the user's saved filters (see
 * `stores/prFilters.store.ts`) — the PR-side twin of {@link useRepoIssues}, and the replacement for
 * the four groups this section used to hardcode.
 *
 * GitHub does the matching, so any qualifier its search box accepts works here. What comes back is
 * the issue view of a PR, missing head/base, so each match is swapped for the full object from
 * `knownPrs` when the repo's own PR list has it — which is what keeps a row's branch, its selection
 * highlight and its actions menu working. A PR the list does not carry (a closed or merged one
 * matched by an explicit `is:closed` filter) keeps the search shape, and the branch-scoped actions
 * disable themselves on its empty `headRef` rather than acting on the wrong thing.
 *
 * Nothing is queried without a token: GitHub's search API rejects an anonymous caller outright, so
 * every saved view of a signed-out user reported the transport's own failure ("Load failed") as if
 * the *query* had been wrong. `isConnected` is what the sidebar renders "connect an account" from.
 */
export function useRepoPrFilters({
  remoteUrls,
  githubToken,
  filters,
  knownPrs,
  enabled = true,
}: UseRepoPrFiltersOptions): UseRepoPrFiltersResult {
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
      ? (['repo-pr-filters', ownerRepo.owner, ownerRepo.repo, resolvedToken, queriesKey] as const)
      : null

  const { data, error, mutate } = useSWR<PrFilterGroup[], Error>(
    swrKey,
    async () => {
      const { owner, repo } = ownerRepo as { owner: string; repo: string }
      return Promise.all(
        filters.map(async (filter) => {
          try {
            const prs = await fetchPullRequestsByQuery(owner, repo, filter.query, resolvedToken)
            return { filter, prs, error: null }
          } catch (err) {
            return { filter, prs: [], error: String(err) }
          }
        })
      )
    },
    { refreshInterval: 60_000, dedupingInterval: 10_000 }
  )

  const knownByNumber = useMemo(() => new Map(knownPrs.map((pr) => [pr.number, pr])), [knownPrs])

  // Re-derived from the *current* filters rather than returned as fetched: a rename or a reorder has
  // to show immediately, and neither is worth a refetch.
  const groups = useMemo(() => {
    const byId = new Map((data ?? []).map((g) => [g.filter.id, g]))
    return filters.map((filter) => {
      const fetched = byId.get(filter.id)
      return {
        filter,
        prs: (fetched?.prs ?? []).map((pr) => knownByNumber.get(pr.number) ?? pr),
        error: fetched?.error ?? null,
      }
    })
  }, [data, filters, knownByNumber])

  const allMatched = useMemo(() => {
    const seen = new Map<number, PullRequest>()
    for (const group of groups) {
      for (const pr of group.prs) if (!seen.has(pr.number)) seen.set(pr.number, pr)
    }
    return Array.from(seen.values())
  }, [groups])

  return {
    groups,
    allMatched,
    isGithub,
    isConnected,
    isLoading: !data && !error && swrKey !== null,
    error: error || null,
    refresh: () => void mutate(),
  }
}
