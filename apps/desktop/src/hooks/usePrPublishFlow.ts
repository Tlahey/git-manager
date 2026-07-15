import { useCallback, useState } from 'react'
import useSWR from 'swr'
import { useQueryClient } from '@tanstack/react-query'
import { useRepoGitHub } from './useRepoGitHub'
import { useRepoDataStore } from '../stores/repoData.store'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'
import { useRepoUIStore } from '../stores/repoUI.store'
import { apiCreateBranch, apiCheckoutBranch, apiPushBranch, apiCreateCommit } from '../api/git.api'
import { createPullRequest, fetchRepoDefaultBranch, type GhRawPR } from '../api/github.api'

/** Which entry-point variant applies for the current branch. `unavailable` = not a GitHub repo,
 * signed out, or a detached HEAD (nothing to publish from). */
export type PrPublishMode = 'protected' | 'feature' | 'unavailable'

/**
 * Orchestrates "ship from here": create a branch (only on a protected branch) → commit → push →
 * open a PR. Split into two steps so the PR description can be authored/AI-filled against the *real*
 * new commit before it's pushed:
 *  1. `commitAndPrepare` — branch (if needed) + commit, then hand off to the composer.
 *  2. `createPr` — push + create the GitHub PR, then swap the repo view to it.
 *
 * The handoff (`composer`) lives in `repoUI.store`, **not** in this hook's local state: committing
 * clears the working tree, which unmounts the WIP staging column the trigger button sits in — so a
 * component-local `preparing` state would be destroyed before the user could fill the PR. Keeping it
 * in the store lets the composer render as a stable center-panel takeover. `busy`/`error` stay local
 * (they belong to whichever component is driving the current async step). Abandoning after step 1
 * just leaves an ordinary local commit (already undo-covered).
 */
export function usePrPublishFlow(repoPath: string) {
  const queryClient = useQueryClient()
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const repo = useRepoDataStore((s) => s.repoCache[repoPath])
  const { protectedBranches } = useEffectiveRepoSettings(repoPath)
  const setActivePrNumber = useRepoUIStore((s) => s.setActivePrNumber)
  const composer = useRepoUIStore((s) => s.prComposer)
  const setPrComposer = useRepoUIStore((s) => s.setPrComposer)

  const currentBranch = repo?.head ?? null
  const isDetached = repo?.isDetached ?? false
  const isProtected = currentBranch != null && protectedBranches.includes(currentBranch)

  const mode: PrPublishMode =
    !ownerRepo || !token || !currentBranch || isDetached
      ? 'unavailable'
      : isProtected
        ? 'protected'
        : 'feature'

  // The GitHub default branch is the base for a feature-branch PR; a protected-branch PR targets the
  // branch you were on. Fetched lazily and cached (only needed in `feature` mode).
  const { data: ghDefaultBranch } = useSWR(
    mode === 'feature' && ownerRepo && token
      ? ['repo-default-branch', ownerRepo.owner, ownerRepo.repo]
      : null,
    () => fetchRepoDefaultBranch(ownerRepo!.owner, ownerRepo!.repo, token!),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Best-known base branch to pre-fill the composer with (user can override). Once a composer is
   * open, it's the base captured at prepare time; otherwise the mode's default. */
  const defaultBaseRef = composer
    ? composer.baseRef
    : mode === 'protected'
      ? currentBranch
      : (ghDefaultBranch ?? null)

  const commitAndPrepare = useCallback(
    async ({ commitMessage, newBranchName }: { commitMessage: string; newBranchName?: string }) => {
      if (mode === 'unavailable' || !commitMessage.trim()) return
      setError(null)
      setBusy(true)
      try {
        let head = currentBranch as string
        let base = ghDefaultBranch ?? currentBranch ?? ''

        if (mode === 'protected') {
          const name = newBranchName?.trim()
          if (!name) throw new Error('A new branch name is required on a protected branch')
          await apiCreateBranch(repoPath, name, 'HEAD')
          await apiCheckoutBranch(repoPath, name, {
            fromRef: currentBranch as string,
            fromDetached: false,
          })
          head = name
          base = currentBranch as string // PR targets the protected branch you branched from
        }

        await apiCreateCommit(repoPath, commitMessage)

        // The commit + (maybe) new branch changed the log, branch list and working status.
        queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })

        // Hand off to the center composer. Must be the *last* step: it takes over the center panel,
        // and the preceding commit will unmount the WIP column this call was made from.
        setPrComposer({ head, baseRef: base, title: commitMessage })
      } catch (e) {
        setError(String(e))
        throw e
      } finally {
        setBusy(false)
      }
    },
    [mode, currentBranch, ghDefaultBranch, repoPath, queryClient, setPrComposer]
  )

  const createPr = useCallback(
    async ({
      title,
      body,
      baseRef,
    }: {
      title: string
      body: string
      baseRef: string
    }): Promise<GhRawPR | undefined> => {
      if (!ownerRepo || !token || !composer) return
      setError(null)
      setBusy(true)
      try {
        await apiPushBranch(repoPath)
        const pr = await createPullRequest(
          ownerRepo.owner,
          ownerRepo.repo,
          { title, head: composer.head, base: baseRef, body },
          token
        )
        setPrComposer(null)
        setActivePrNumber(pr.number)
        return pr
      } catch (e) {
        setError(String(e))
        throw e
      } finally {
        setBusy(false)
      }
    },
    [ownerRepo, token, composer, repoPath, setActivePrNumber, setPrComposer]
  )

  const cancel = useCallback(() => {
    setPrComposer(null)
    setError(null)
  }, [setPrComposer])

  return {
    mode,
    composer,
    busy,
    error,
    currentBranch,
    defaultBaseRef,
    commitAndPrepare,
    createPr,
    cancel,
  }
}
