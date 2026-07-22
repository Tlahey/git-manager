import { useMemo } from 'react'
import useSWR from 'swr'
import type { PullRequest } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'
import { fetchClosedPullRequests, rawToPullRequest } from '../api/github.api'
import { firstGitHubOwnerRepo } from '../lib/githubRemote'

export interface UseMergedPrsByBranchOptions {
  remoteUrls: string[]
  githubToken?: string
  enabled?: boolean
}

/**
 * Map of head-branch name → the merged pull request that shipped it, for the branch/worktree status
 * tags in the sidebar. `usePullRequests` only fetches *open* PRs, so a branch/worktree that's
 * already merged has no open PR to match — this fills that gap from the recently-updated closed PRs
 * (matched on `head.ref` + `merged_at`, the same persisted fields `useMergedWorktrees` relies on,
 * which survive GitHub auto-deleting the branch after merge). Capped at the 100 most recently
 * updated closed PRs, like every other GitHub list call here; the first match for a reused branch
 * name (most recently updated) wins.
 */
export function useMergedPrsByBranch({
  remoteUrls,
  githubToken,
  enabled = true,
}: UseMergedPrsByBranchOptions): Map<string, PullRequest> {
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) || null
  const token = githubToken || (activeAccount?.token ?? undefined)

  const ownerRepo = firstGitHubOwnerRepo(remoteUrls)
  const isGithub = ownerRepo !== null

  const swrKey =
    enabled && isGithub && ownerRepo && token
      ? ['sidebar-closed-prs', ownerRepo.owner, ownerRepo.repo, token]
      : null

  const { data } = useSWR(
    swrKey,
    ([, owner, repo, tok]) => fetchClosedPullRequests(owner, repo, tok),
    { refreshInterval: 60_000, dedupingInterval: 10_000, revalidateOnFocus: false }
  )

  return useMemo(() => {
    const map = new Map<string, PullRequest>()
    for (const raw of data ?? []) {
      const ref = raw.head?.ref
      // Only merged PRs (a plain closed/rejected PR shouldn't tag a branch), and keep the first —
      // the list is sorted by `updated` desc, so that's the most recent for a reused branch name.
      if (!ref || !raw.merged_at || map.has(ref)) continue
      map.set(ref, rawToPullRequest(raw))
    }
    return map
  }, [data])
}
