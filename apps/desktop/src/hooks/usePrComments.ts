import useSWR from 'swr'
import { fetchPrComments, type GhComment } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'
import { useGithubPollInterval } from './useGithubPollInterval'

/** The PR's issue-style conversation comments. Manual refresh via `mutate` (the view has a refresh
 * button) plus a modest background interval so a freshly posted comment appears without a reload. */
export function usePrComments(
  repoPath: string | null,
  prNumber: number | null
): {
  comments: GhComment[]
  isLoading: boolean
  error: unknown
  refresh: () => void
} {
  const { ownerRepo, accountId } = useRepoGitHub(repoPath)

  const refreshInterval = useGithubPollInterval(60_000, accountId, 'core')

  const { data, isLoading, error, mutate } = useSWR(
    prNumber != null && ownerRepo && accountId
      ? ['pr-comments', ownerRepo.owner, ownerRepo.repo, prNumber, accountId]
      : null,
    () =>
      fetchPrComments(ownerRepo!.owner, ownerRepo!.repo, prNumber as number, accountId as string),
    { revalidateOnFocus: false, refreshInterval }
  )

  return { comments: data ?? [], isLoading, error, refresh: () => void mutate() }
}
