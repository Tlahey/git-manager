import useSWR from 'swr'
import { fetchRepoIssues } from '../api/github.api'
import type { MockIssue } from '../lib/github/types'
import { useRepoGitHub } from './useRepoGitHub'

/**
 * The repo's open issues, for the board's "add an issue to track" picker.
 *
 * Fetched lazily like {@link useAssignableUsers}: `enabled` goes true only when the dialog opens, so
 * a board that never adds an issue never pays for the request.
 *
 * Open issues only — that's what the endpoint returns, and it is the right pool to *start* tracking
 * from. A closed issue can still be tracked by pasting its number, and an already-tracked issue that
 * later closes is fetched by number, not from this list.
 */
export function useRepoOpenIssues(
  repoPath: string | null,
  enabled: boolean
): { issues: MockIssue[]; isLoading: boolean } {
  const { ownerRepo, accountId } = useRepoGitHub(repoPath)
  const { data, isLoading } = useSWR(
    enabled && ownerRepo && accountId
      ? ['repo-open-issues', ownerRepo.owner, ownerRepo.repo, accountId]
      : null,
    () => fetchRepoIssues(ownerRepo!.owner, ownerRepo!.repo, accountId as string),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
  return { issues: data ?? [], isLoading }
}
