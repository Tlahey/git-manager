import useSWR from 'swr'
import type { GitBranch } from '@git-manager/git-types'
import { useSettingsStore } from '../stores/settings.store'
import { fetchClosedPullRequests, fetchCommitMergedPullRequestForBranch } from '../api/github.api'
import { apiGoneUpstreamBranches } from '../api/worktree.api'
import { firstGitHubOwnerRepo } from '../lib/githubRemote'
import { DEFAULT_PINNED } from '../components/repository-sidebar/types'

/** Why a local branch is or isn't offered for bulk pruning — surfaced per-branch in the dialog.
 * `worktree` = checked out in a linked worktree, so git won't let it be deleted; `branch-gone` =
 * its upstream remote branch no longer exists (merged then deleted/pruned); `{ merged }` = its tip
 * commit belongs to a merged GitHub pull request of this same branch (or a closed PR matches). */
export type BranchMergeStatus =
  | 'checking'
  | 'no-match'
  | 'branch-gone'
  | 'worktree'
  | { merged: { number: number; title: string; author?: string } }

export interface BranchMergeCheck {
  branch: GitBranch
  status: BranchMergeStatus
}

export interface UseMergedBranchesResult {
  /** One entry per prunable-candidate branch (the current HEAD and main/master are excluded). */
  checks: BranchMergeCheck[]
  /** Branches whose status resolved to merged — the actual deletion candidates. */
  mergedBranches: GitBranch[]
  isLoading: boolean
  isGithub: boolean
  hasToken: boolean
}

/** A branch that must never be bulk-pruned: the checked-out HEAD, or the default (main/master). */
function isProtected(branch: GitBranch): boolean {
  return branch.isHead || DEFAULT_PINNED.includes(branch.shortName)
}

/**
 * Resolves each local branch's merge status from the same three signals as `useMergedWorktrees`
 * (commit→PR filtered on `head.ref`, gone upstream, closed-PR name match — see that hook for the
 * details and why the `head.ref` filter is load-bearing). Only non-protected branches are
 * considered, and branches checked out in a linked worktree are surfaced as `worktree` (git refuses
 * to delete them). The actual deletion still runs through the backend's own "merged into HEAD"
 * guard (`apiDeleteBranch` without `force`), so a false-positive signal here can't delete an
 * unmerged branch — it just fails loudly and stays listed.
 */
export function useMergedBranches(
  repoPath: string,
  branches: GitBranch[],
  worktreeBranches: string[],
  remoteUrls: string[],
  githubToken: string | undefined,
  enabled: boolean
): UseMergedBranchesResult {
  const githubSettings = useSettingsStore((s) => s.settings.github)
  const activeAccount =
    githubSettings?.accounts?.find((a) => a.id === githubSettings.activeAccountId) || null
  const token = githubToken || (activeAccount?.token ?? undefined)

  const ownerRepo = firstGitHubOwnerRepo(remoteUrls)
  const isGithub = ownerRepo !== null
  const hasToken = !!token

  const worktreeBranchSet = new Set(worktreeBranches)
  // Shown in the dialog: every local branch except the protected ones (HEAD / main / master).
  const shown = branches.filter((b) => !b.isRemote && !isProtected(b))
  // Actual delete candidates also exclude branches checked out in a worktree (git refuses those).
  const candidates = shown.filter((b) => !worktreeBranchSet.has(b.shortName))

  // ── Local signal: branches whose upstream remote branch is gone (merged then deleted/pruned). ──
  const localKey =
    enabled && candidates.length > 0 ? ['gone-upstream-branches', repoPath] : null
  const { data: goneList } = useSWR(
    localKey,
    () => apiGoneUpstreamBranches(repoPath).catch(() => [] as string[]),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )
  const goneBranches = goneList ? new Set(goneList) : null

  // ── GitHub signal 1: the merged PR of each candidate's tip commit, filtered on its own name. ──
  const candidatePairs = candidates.map((b) => ({ oid: b.commitOid, branch: b.shortName }))
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

  const checks: BranchMergeCheck[] = shown.map((b) => {
    if (worktreeBranchSet.has(b.shortName)) return { branch: b, status: 'worktree' }
    const commitPr = commitPrMap?.get(`${b.commitOid}@${b.shortName}`)
    if (commitPr) {
      return {
        branch: b,
        status: { merged: { number: commitPr.number, title: commitPr.title, author: commitPr.author } },
      }
    }
    const prMatch = prList?.find((pr) => pr.head?.ref === b.shortName && pr.merged_at)
    if (prMatch) {
      return {
        branch: b,
        status: { merged: { number: prMatch.number, title: prMatch.title, author: prMatch.user?.login } },
      }
    }
    if (goneBranches?.has(b.shortName)) return { branch: b, status: 'branch-gone' }
    if (stillChecking) return { branch: b, status: 'checking' }
    return { branch: b, status: 'no-match' }
  })

  const mergedBranches = checks
    .filter((c) => typeof c.status === 'object' || c.status === 'branch-gone')
    .map((c) => c.branch)

  return {
    checks,
    mergedBranches,
    isLoading: stillChecking,
    isGithub,
    hasToken,
  }
}
