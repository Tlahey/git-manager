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
  const { ownerRepo, token } = useRepoGitHub(repoPath)

  const { data, isLoading, error, mutate } = useSWR(
    prNumber != null && ownerRepo && token
      ? ['pr-detail', ownerRepo.owner, ownerRepo.repo, prNumber, token]
      : null,
    () =>
      fetchGitHubPRDetails(
        `https://api.github.com/repos/${ownerRepo!.owner}/${ownerRepo!.repo}/pulls/${prNumber}`,
        token as string
      ),
    { revalidateOnFocus: false, refreshInterval: 30_000 }
  )

  return { pr: data, isLoading, error, mutate: () => void mutate() }
}
