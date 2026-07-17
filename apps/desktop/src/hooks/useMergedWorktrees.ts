import useSWR from 'swr'
import type { GitWorktree } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'
import { fetchClosedPullRequests, fetchCommitMergedPullRequestForBranch } from '../api/github.api'
import { apiGoneUpstreamBranches } from '../api/worktree.api'
import { firstGitHubOwnerRepo } from '../lib/githubRemote'

/** Why a worktree is or isn't offered for bulk removal — surfaced per-worktree in the dialog
 * instead of a single opaque "nothing to remove", since guessing at the cause from the outside
 * has repeatedly been wrong. `branch-gone` = the branch's upstream remote branch no longer exists
 * (merged then deleted/pruned — a local, GitHub-independent signal); `{ merged }` = the worktree's
 * HEAD commit belongs to a merged GitHub pull request (or its branch name matches one). */
export type WorktreeMergeStatus =
  | 'dirty'
  | 'detached'
  | 'checking'
  | 'no-match'
  | 'branch-gone'
  | { merged: { number: number; title: string; author?: string } }

export interface WorktreeMergeCheck {
  worktree: GitWorktree
  status: WorktreeMergeStatus
}

export interface UseMergedWorktreesResult {
  /** One entry per worktree passed in, in the same order, each with its own status. */
  checks: WorktreeMergeCheck[]
  /** Worktrees whose status resolved to a merged PR — the actual removal candidates. */
  mergedWorktrees: GitWorktree[]
  isLoading: boolean
  isGithub: boolean
  hasToken: boolean
}

/**
 * Resolves each worktree's merge status from three complementary signals:
 *
 * 1. **Commit → pull request** (`fetchCommitMergedPullRequestForBranch`): the worktree's HEAD
 *    commit belongs to a merged PR whose source branch is *this worktree's branch*
 *    (`GET /commits/{sha}/pulls` filtered on `head.ref`). The most direct, reliable signal for a
 *    merge-commit workflow — the merged branch-tip commit reports its PR as merged regardless of PR
 *    age or whether the branch still exists. The `head.ref` filter is load-bearing: without it, a
 *    branch with no unique commits (fresh from main) matches the unrelated PR that shipped its
 *    fork-point commit, which once bulk-deleted a never-merged worktree. (Only reports "merged"
 *    once the commit is reachable from the default branch, so it misses squash merges — the other
 *    signals cover those.)
 * 2. **Gone upstream** (`apiGoneUpstreamBranches`): the branch tracked a remote branch that no
 *    longer exists — after the PR merges, GitHub deletes the remote branch and `git fetch --prune`
 *    drops the `origin/<branch>` ref, leaving the upstream "gone". Local, no GitHub needed.
 * 3. **Merged pull request by name** (`fetchClosedPullRequests`): the branch name matches a closed
 *    PR with `merged_at` set — covers repos that keep the remote branch, capped at the 100 most
 *    recently updated closed PRs.
 *
 * A worktree qualifies if *any* signal fires; a matched PR is preferred as the surfaced status
 * because it carries the PR number/title for display. Every fetch resolves failures to null/empty,
 * so one signal being unavailable never blocks the others or hangs the dialog.
 */
export function useMergedWorktrees(
  repoPath: string,
  worktrees: GitWorktree[],
  remoteUrls: string[],
  githubToken: string | undefined,
  enabled: boolean
): UseMergedWorktreesResult {
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) || null
  const token = githubToken || (activeAccount?.token ?? undefined)

  const ownerRepo = firstGitHubOwnerRepo(remoteUrls)
  const isGithub = ownerRepo !== null
  const hasToken = !!token

  // A detached-HEAD worktree has no branch to look up a PR for.
  const candidates = worktrees.filter((wt) => !wt.isDirty && wt.branch !== '(detached HEAD)')

  // ── Local signal: branches whose upstream remote branch is gone (merged then deleted/pruned). ──
  const localKey =
    enabled && candidates.length > 0 ? ['gone-upstream-branches', repoPath] : null
  const { data: goneList } = useSWR(
    localKey,
    // Resolve failures to [] (like fetchClosedPullRequests does) so a backend error — e.g. the
    // command missing because the app wasn't rebuilt — degrades to "no local match" instead of
    // leaving SWR's data undefined forever, which would hang the dialog on "Checking…".
    () => apiGoneUpstreamBranches(repoPath).catch(() => [] as string[]),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
  const goneBranches = goneList ? new Set(goneList) : null

  // ── GitHub signal 1: the merged PR of each candidate's HEAD commit, filtered on the candidate's
  // own branch name (see fetchCommitMergedPullRequestForBranch for why the filter is critical). ──
  const candidatePairs = candidates.map((wt) => ({ oid: wt.commitOid, branch: wt.branch }))
  const commitPrKey =
    enabled && ownerRepo && token && candidatePairs.length > 0
      ? [
          'commit-merged-prs',
          repoPath,
          ownerRepo.owner,
          ownerRepo.repo,
          token,
          candidatePairs
            .map((p) => `${p.oid}@${p.branch}`)
            .sort()
            .join(','),
        ]
      : null
  const { data: commitPrMap } = useSWR(
    commitPrKey,
    async () => {
      const { owner, repo } = ownerRepo as { owner: string; repo: string }
      const entries = await Promise.all(
        candidatePairs.map(
          async ({ oid, branch }) =>
            [
              `${oid}@${branch}`,
              await fetchCommitMergedPullRequestForBranch(owner, repo, oid, branch, token).catch(
                () => null
              ),
            ] as const
        )
      )
      return new Map(entries)
    },
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  // ── GitHub signal 2: closed pull requests, matched on head ref + merged_at. ──
  const prKey =
    enabled && ownerRepo && token && candidates.length > 0
      ? ['closed-pull-requests', repoPath, ownerRepo.owner, ownerRepo.repo, token]
      : null
  const { data: prList } = useSWR(
    prKey,
    () => {
      const { owner, repo } = ownerRepo as { owner: string; repo: string }
      return fetchClosedPullRequests(owner, repo, token)
    },
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  const localPending = localKey !== null && goneList === undefined
  const prPending = prKey !== null && prList === undefined
  const commitPrPending = commitPrKey !== null && commitPrMap === undefined
  const stillChecking = localPending || prPending || commitPrPending

  const checks: WorktreeMergeCheck[] = worktrees.map((wt) => {
    if (wt.isDirty) return { worktree: wt, status: 'dirty' }
    if (wt.branch === '(detached HEAD)') return { worktree: wt, status: 'detached' }
    // Most direct signal: the HEAD commit belongs to a merged PR of this very branch.
    const commitPr = commitPrMap?.get(`${wt.commitOid}@${wt.branch}`)
    if (commitPr) {
      return {
        worktree: wt,
        status: { merged: { number: commitPr.number, title: commitPr.title, author: commitPr.author } },
      }
    }
    const prMatch = prList?.find((pr) => pr.head?.ref === wt.branch && pr.merged_at)
    if (prMatch) {
      return {
        worktree: wt,
        status: { merged: { number: prMatch.number, title: prMatch.title, author: prMatch.user?.login } },
      }
    }
    if (goneBranches?.has(wt.branch)) return { worktree: wt, status: 'branch-gone' }
    if (stillChecking) return { worktree: wt, status: 'checking' }
    return { worktree: wt, status: 'no-match' }
  })

  const mergedWorktrees = checks
    .filter((c) => typeof c.status === 'object' || c.status === 'branch-gone')
    .map((c) => c.worktree)

  return {
    checks,
    mergedWorktrees,
    isLoading: stillChecking,
    isGithub,
    hasToken,
  }
}
