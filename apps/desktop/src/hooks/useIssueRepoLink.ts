import { useMemo } from 'react'
import useSWR from 'swr'
import { useRepoDataStore } from '../stores/repoData.store'
import { apiGetRemotes, apiGetBranches } from '../api/git.api'
import { firstGitHubOwnerRepo } from '../lib/githubRemote'
import { branchMatchesIssue } from '../app/pull-requests/utils'
import type { MockIssue } from '../app/pull-requests/types'

/**
 * Resolves `owner/repo` → local path for every added repo, once, shared across all issue rows (SWR
 * dedupes by the paths key so N rows don't each re-read the remotes). Case-insensitive keys, since
 * GitHub owners/repos are.
 */
function useSavedRepoOwnerMap() {
  const savedRepos = useRepoDataStore((s) => s.savedRepos)
  const paths = savedRepos.map((r) => r.path)

  const { data } = useSWR(
    paths.length > 0 ? ['saved-repo-owner-map', paths.join('\n')] : null,
    async () => {
      const entries = await Promise.all(
        paths.map(async (path) => {
          try {
            const remotes = await apiGetRemotes(path)
            const ownerRepo = firstGitHubOwnerRepo(remotes.map((r) => r.url))
            return ownerRepo ? ([`${ownerRepo.owner}/${ownerRepo.repo}`.toLowerCase(), path] as const) : null
          } catch {
            return null
          }
        })
      )
      return Object.fromEntries(entries.filter((e): e is readonly [string, string] => e !== null))
    },
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  return { map: data ?? {}, savedRepos }
}

export interface IssueRepoLink {
  /** Local path of the added repo this issue belongs to, or `null` if it isn't added. */
  repoPath: string | null
  /** A local branch already referencing the issue number, or `null` (→ show "Create a branch"). */
  branch: string | null
  /** Re-read the repo's branches after creating one, so the row updates to show it. */
  refreshBranch: () => void
}

/**
 * Ties a Launchpad issue to the user's local checkout of its repo: the added-repo path (for View
 * repo / Create a branch) and whether a local branch already references the issue number. Matching
 * is by the repo's GitHub `owner/repo` (from its remote), falling back to the repo name.
 */
export function useIssueRepoLink(issue: MockIssue): IssueRepoLink {
  const { map, savedRepos } = useSavedRepoOwnerMap()

  const repoPath = useMemo(() => {
    const key = issue.fullName?.toLowerCase()
    if (key && map[key]) return map[key]
    return savedRepos.find((r) => r.name === issue.repo)?.path ?? null
  }, [issue.fullName, issue.repo, map, savedRepos])

  const { data: branches, mutate } = useSWR(
    repoPath ? ['issue-repo-branches', repoPath] : null,
    () => apiGetBranches(repoPath as string, false),
    { revalidateOnFocus: false }
  )

  const branch = useMemo(() => {
    const match = (branches ?? []).find((b) => branchMatchesIssue(b.shortName, issue.number))
    return match?.shortName ?? null
  }, [branches, issue.number])

  return { repoPath, branch, refreshBranch: () => void mutate() }
}
