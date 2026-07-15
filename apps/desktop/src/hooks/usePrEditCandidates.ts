import useSWR from 'swr'
import { fetchAssignableUsers, fetchRepoLabels, type GhUser, type GhLabel } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/** Assignable users for the repo (reviewer/assignee candidates). Fetched lazily — pass `enabled`
 * true only when an edit popover opens, so opening a PR doesn't hit these endpoints. */
export function useAssignableUsers(
  repoPath: string | null,
  enabled: boolean
): { users: GhUser[]; isLoading: boolean } {
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const { data, isLoading } = useSWR(
    enabled && ownerRepo && token
      ? ['repo-assignable-users', ownerRepo.owner, ownerRepo.repo, token]
      : null,
    () => fetchAssignableUsers(ownerRepo!.owner, ownerRepo!.repo, token as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
  return { users: data ?? [], isLoading }
}

/** All labels defined in the repo (label candidates). Fetched lazily, like {@link useAssignableUsers}. */
export function useRepoLabels(
  repoPath: string | null,
  enabled: boolean
): { labels: GhLabel[]; isLoading: boolean } {
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const { data, isLoading } = useSWR(
    enabled && ownerRepo && token ? ['repo-labels', ownerRepo.owner, ownerRepo.repo, token] : null,
    () => fetchRepoLabels(ownerRepo!.owner, ownerRepo!.repo, token as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
  return { labels: data ?? [], isLoading }
}
