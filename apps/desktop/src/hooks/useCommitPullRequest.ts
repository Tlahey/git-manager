import useSWR from 'swr'
import { fetchCommitPullRequest, type CommitPrRef } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'

/** The GitHub pull request associated with `oid`, or null (no PR / non-GitHub repo / signed out). */
export function useCommitPullRequest(repoPath: string | null, oid: string | null): CommitPrRef | null {
  const { ownerRepo, token } = useRepoGitHub(repoPath)

  const { data } = useSWR(
    oid && ownerRepo ? ['commit-pr', ownerRepo.owner, ownerRepo.repo, oid, token] : null,
    () =>
      fetchCommitPullRequest(
        (ownerRepo as { owner: string; repo: string }).owner,
        (ownerRepo as { owner: string; repo: string }).repo,
        oid as string,
        token ?? undefined
      ),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  return data ?? null
}
