import useSWR from 'swr'
import { fetchPrFiles, type GhPrFile } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/** The list of files changed by a pull request, for the right-hand panel. */
export function usePrFiles(
  repoPath: string | null,
  prNumber: number | null
): {
  files: GhPrFile[]
  isLoading: boolean
  error: unknown
} {
  const { ownerRepo, accountId } = useRepoGitHub(repoPath)

  const { data, isLoading, error } = useSWR(
    prNumber != null && ownerRepo && accountId
      ? ['pr-files', ownerRepo.owner, ownerRepo.repo, prNumber, accountId]
      : null,
    () => fetchPrFiles(ownerRepo!.owner, ownerRepo!.repo, prNumber as number, accountId as string),
    { revalidateOnFocus: false }
  )

  return { files: data ?? [], isLoading, error }
}
