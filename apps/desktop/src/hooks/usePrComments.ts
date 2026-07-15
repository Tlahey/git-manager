import useSWR from 'swr'
import { fetchPrComments, type GhComment } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

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
  const { ownerRepo, token } = useRepoGitHub(repoPath)

  const { data, isLoading, error, mutate } = useSWR(
    prNumber != null && ownerRepo && token
      ? ['pr-comments', ownerRepo.owner, ownerRepo.repo, prNumber, token]
      : null,
    () => fetchPrComments(ownerRepo!.owner, ownerRepo!.repo, prNumber as number, token as string),
    { revalidateOnFocus: false, refreshInterval: 60_000 }
  )

  return { comments: data ?? [], isLoading, error, refresh: () => void mutate() }
}
