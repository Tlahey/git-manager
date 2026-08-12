import useSWR from 'swr'
import { fetchPrMergeability, type PrMergeability } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/** GitHub-style mergeability + checks for a PR (review decision, merge-state status, per-check
 * required flags). Polls on a modest interval so in-progress checks tick forward while the box is
 * open. Keyed by head SHA so a new push refetches. */
export function usePrMergeability(
  repoPath: string | null,
  prNumber: number | null,
  headSha: string | null
): {
  mergeability: PrMergeability | undefined
  isLoading: boolean
  error: unknown
  refresh: () => void
} {
  const { ownerRepo, accountId } = useRepoGitHub(repoPath)

  const { data, isLoading, error, mutate } = useSWR(
    prNumber != null && ownerRepo && accountId
      ? ['pr-mergeability', ownerRepo.owner, ownerRepo.repo, prNumber, headSha, accountId]
      : null,
    () =>
      fetchPrMergeability(
        ownerRepo!.owner,
        ownerRepo!.repo,
        prNumber as number,
        accountId as string
      ),
    { revalidateOnFocus: false, refreshInterval: 20_000 }
  )

  return { mergeability: data, isLoading, error, refresh: () => void mutate() }
}
