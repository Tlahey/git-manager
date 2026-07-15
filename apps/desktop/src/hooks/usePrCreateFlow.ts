import { useCallback, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { useQueryClient } from '@tanstack/react-query'
import { useRepoGitHub } from './useRepoGitHub'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { apiCheckoutBranch, apiPushBranch } from '../api/git.api'
import { createPullRequest, fetchRepoDefaultBranch, type GhRawPR } from '../api/github.api'

export interface CreatePrArgs {
  /** Source branch the PR is opened from. Must be pushable to origin. */
  head: string
  /** Target branch the PR merges into. */
  base: string
  title: string
  body: string
  draft: boolean
}

/**
 * Standalone "create a pull request" flow for the sidebar entry point — unlike
 * {@link usePrPublishFlow}, it needs no prior commit/composer handoff. Picks head + base branch,
 * pushes the head, opens the GitHub PR, then swaps the repo view to it.
 *
 * `head` other than the current branch is checked out first (`apiPushBranch` pushes the current
 * HEAD); a dirty working tree makes that checkout fail and the error is surfaced rather than
 * swallowed.
 */
export function usePrCreateFlow(repoPath: string) {
  const queryClient = useQueryClient()
  const { ownerRepo, token } = useRepoGitHub(repoPath)
  const repo = useRepoDataStore((s) => s.repoCache[repoPath])
  const setActivePrNumber = useRepoUIStore((s) => s.setActivePrNumber)
  const setPrCreateOpen = useRepoUIStore((s) => s.setPrCreateOpen)

  const currentBranch = repo?.head ?? null
  const isDetached = repo?.isDetached ?? false

  // The GitHub default branch pre-fills the base selector; fetched lazily and cached.
  const { data: defaultBase } = useSWR(
    ownerRepo && token ? ['repo-default-branch', ownerRepo.owner, ownerRepo.repo] : null,
    () => fetchRepoDefaultBranch(ownerRepo!.owner, ownerRepo!.repo, token!),
    { revalidateOnFocus: false, revalidateIfStale: false }
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createPr = useCallback(
    async ({ head, base, title, body, draft }: CreatePrArgs): Promise<GhRawPR | undefined> => {
      if (!ownerRepo || !token || !head || !base || !title.trim()) return
      setError(null)
      setBusy(true)
      try {
        if (currentBranch && head !== currentBranch) {
          await apiCheckoutBranch(repoPath, head, {
            fromRef: currentBranch,
            fromDetached: isDetached,
          })
          queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
          queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
        }

        await apiPushBranch(repoPath)
        const pr = await createPullRequest(
          ownerRepo.owner,
          ownerRepo.repo,
          { title: title.trim(), head, base, body, draft },
          token
        )

        // Refresh the sidebar PR list so the new PR shows up immediately.
        mutate(['repo-pull-requests', ownerRepo.owner, ownerRepo.repo, token])

        setPrCreateOpen(false)
        setActivePrNumber(pr.number)
        return pr
      } catch (e) {
        setError(String(e))
        throw e
      } finally {
        setBusy(false)
      }
    },
    [
      ownerRepo,
      token,
      currentBranch,
      isDetached,
      repoPath,
      queryClient,
      setActivePrNumber,
      setPrCreateOpen,
    ]
  )

  const cancel = useCallback(() => {
    setPrCreateOpen(false)
    setError(null)
  }, [setPrCreateOpen])

  return {
    ownerRepo,
    token,
    currentBranch,
    defaultBase: defaultBase ?? null,
    busy,
    error,
    createPr,
    cancel,
  }
}
