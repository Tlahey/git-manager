import { useMemo } from 'react'
import type { PullRequest } from '@git-manager/git-types'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useRepoDataStore } from '../stores/repoData.store'
import { useSettingsStore } from '../stores/settings.store'
import { useBranches } from './useBranches'
import { usePullRequests } from './usePullRequests'
import { useMergedPrsByBranch } from './useMergedPrsByBranch'

/**
 * The pull request linked to the currently active branch/workspace, for the toolbar status tag.
 * Resolves the HEAD branch of the effective repo/workspace path (a viewed workspace has its own
 * HEAD) and matches it against open + merged PRs by head ref. An open PR wins over a merged one
 * sharing the branch name (a reused branch), and a merged PR wins over a lingering draft — mirroring
 * the sidebar's `prByBranch` precedence. Returns `undefined` when nothing is linked.
 */
export function useActiveBranchPr(): PullRequest | undefined {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const activeWorkspacePath = useRepoUIStore((s) => s.activeWorkspacePath)
  const repoCache = useRepoDataStore((s) => s.repoCache)
  const github = useSettingsStore((s) => s.settings.github)
  const activeAccount = github?.accounts?.find((a) => a.id === github.activeAccountId) || null

  const effectiveRepoPath = activeWorkspacePath ?? activeRepo ?? ''
  // Remotes are repo-global (shared by every worktree), so they key off the repo tab, not the path.
  const remoteUrls = activeRepo ? (repoCache[activeRepo]?.remotes ?? []) : []
  const githubToken = activeAccount?.token ?? undefined
  const currentUser = activeAccount?.user?.login

  const { data: branches = [] } = useBranches(effectiveRepoPath)
  const currentBranch = useMemo(
    () => branches.find((b) => !b.isRemote && b.isHead)?.shortName,
    [branches]
  )

  const { allPrs } = usePullRequests({ remoteUrls, currentUser, githubToken })
  const mergedByBranch = useMergedPrsByBranch({ remoteUrls, githubToken })

  return useMemo(() => {
    if (!currentBranch) return undefined
    // `allPrs` holds the live (open/draft) PRs; the merged map fills in already-shipped branches.
    const live = allPrs.find((pr) => pr.headRef === currentBranch)
    if (live?.state === 'open') return live
    const merged = mergedByBranch.get(currentBranch)
    if (merged) return merged
    return live
  }, [currentBranch, allPrs, mergedByBranch])
}
