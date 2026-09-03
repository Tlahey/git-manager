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
  const { ownerRepo, accountId, remotesError, isResolvingRemotes } = useRepoGitHub(repoPath)

  const { data, isLoading, error, mutate } = useSWR(
    issueNumber != null && ownerRepo && accountId
      ? ['issue-detail', ownerRepo.owner, ownerRepo.repo, issueNumber, accountId]
      : null,
    () =>
      fetchIssueDetail(
        ownerRepo!.owner,
        ownerRepo!.repo,
        issueNumber as number,
        accountId as string
      ),
    { revalidateOnFocus: false, refreshInterval: 60_000 }
  )

  // `ownerRepo` resolves asynchronously from the repo's remotes; once that lookup has settled with
  // no GitHub remote found, the SWR key above stays `null` forever and this fetch never even starts
  // — so without this, `isLoading`/`error` would both stay falsy and the caller spins indefinitely.
  const noGitHubRemote = issueNumber != null && !!accountId && !isResolvingRemotes && !ownerRepo

  return {
    issue: data,
    isLoading: isLoading || (issueNumber != null && !!accountId && isResolvingRemotes),
    error:
      remotesError ?? error ?? (noGitHubRemote ? new Error('No GitHub remote found') : undefined),
    refresh: () => void mutate(),
  }
}
