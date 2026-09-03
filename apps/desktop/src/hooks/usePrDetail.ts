import useSWR from 'swr'
import { fetchGitHubPRDetails, type GhRawPR } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/** Full details of one pull request (body, mergeable state, head SHA, counts…). Refetches on a
 * modest interval so CI/mergeability stay reasonably fresh while the PR view is open. */
export function usePrDetail(
  repoPath: string | null,
  prNumber: number | null
): {
  pr: GhRawPR | undefined
  isLoading: boolean
  error: unknown
  mutate: () => void
} {
  const { ownerRepo, accountId, remotesError, isResolvingRemotes } = useRepoGitHub(repoPath)

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

  // `ownerRepo` resolves asynchronously from the repo's remotes; once that lookup has settled with
  // no GitHub remote found, the SWR key above stays `null` forever and this fetch never even starts
  // — so without this, `isLoading`/`error` would both stay falsy and the caller spins indefinitely.
  const noGitHubRemote = prNumber != null && !!accountId && !isResolvingRemotes && !ownerRepo

  return {
    pr: data,
    isLoading: isLoading || (prNumber != null && !!accountId && isResolvingRemotes),
    error:
      remotesError ?? error ?? (noGitHubRemote ? new Error('No GitHub remote found') : undefined),
    mutate: () => void mutate(),
  }
}
