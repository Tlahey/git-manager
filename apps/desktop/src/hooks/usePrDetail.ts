import useSWR from 'swr'
import { fetchGitHubPRDetails, type GhRawPR } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'
import { resolveGithubDetailState, type GithubDetailFailure } from './githubDetailState'

/** Full details of one pull request (body, mergeable state, head SHA, counts…). Refetches on a
 * modest interval so CI/mergeability stay reasonably fresh while the PR view is open. */
export function usePrDetail(
  repoPath: string | null,
  prNumber: number | null
): {
  pr: GhRawPR | undefined
  isLoading: boolean
  /** Why there is nothing to show — see {@link resolveGithubDetailState}. */
  failure: GithubDetailFailure | undefined
  mutate: () => void
} {
  const { ownerRepo, accountId, remotesError, isResolvingRemotes, retryRemotes } =
    useRepoGitHub(repoPath)

  const { data, isLoading, error, mutate } = useSWR(
    prNumber != null && ownerRepo && accountId
      ? ['pr-detail', ownerRepo.owner, ownerRepo.repo, prNumber, accountId]
      : null,
    () =>
      fetchGitHubPRDetails(
        `https://api.github.com/repos/${ownerRepo!.owner}/${ownerRepo!.repo}/pulls/${prNumber}`,
        accountId as string
      ),
    { revalidateOnFocus: false, refreshInterval: 30_000 }
  )

  const { isLoading: gateLoading, failure } = resolveGithubDetailState({
    enabled: prNumber != null,
    accountId,
    ownerRepo,
    isResolvingRemotes,
    remotesError,
    isFetching: isLoading,
    fetchError: error,
  })

  return {
    pr: data,
    isLoading: gateLoading,
    failure,
    // Retries the remotes lookup too: when that is what failed, the SWR key above is null and
    // `mutate()` alone would revalidate nothing.
    mutate: () => {
      retryRemotes()
      void mutate()
    },
  }
}
