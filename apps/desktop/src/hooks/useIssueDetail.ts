import useSWR from 'swr'
import { fetchIssueDetail, type GhRawIssue } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/**
 * Full details of one issue (body, state, labels, assignees) for the in-app issue panel. Resolves
 * `owner/repo` + token via {@link useRepoGitHub} — the panel provides them through
 * `RepoGitHubOverrideContext`, so this works for any listed issue even when its repo isn't cloned.
 * Mirrors {@link usePrDetail}.
 */
export function useIssueDetail(
  repoPath: string | null,
  issueNumber: number | null
): {
  issue: GhRawIssue | undefined
  isLoading: boolean
  error: unknown
  refresh: () => void
} {
  const { ownerRepo, token } = useRepoGitHub(repoPath)

  const { data, isLoading, error, mutate } = useSWR(
    issueNumber != null && ownerRepo && token
      ? ['issue-detail', ownerRepo.owner, ownerRepo.repo, issueNumber, token]
      : null,
    () => fetchIssueDetail(ownerRepo!.owner, ownerRepo!.repo, issueNumber as number, token as string),
    { revalidateOnFocus: false, refreshInterval: 60_000 }
  )

  return { issue: data, isLoading, error, refresh: () => void mutate() }
}
