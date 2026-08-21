import { useCallback } from 'react'
import useSWR from 'swr'
import type { GitWorktree } from '@git-manager/git-types'
import { apiListWorktrees } from '../../../api/worktree.api'

/**
 * Which worktree is holding which branch — the one fact the card's worktree action has to know
 * *before* it is clicked.
 *
 * git allows a branch in exactly one worktree (`fatal: '<branch>' is already used by worktree at
 * …`), and a card's own "Create branch" checks the new branch out right here — so the section's two
 * buttons sit one above the other in the state where the second cannot possibly work. That is the
 * ordinary state straight after creating a branch, not an edge case, which is why the answer is
 * fetched for the render rather than discovered by the failing call.
 *
 * SWR under a key of its own rather than the graph's `['worktrees', repoPath]` react-query cache,
 * deliberately: the board feature is SWR throughout (per `.agents/AGENTS.md`, new hooks are), and
 * sharing that cache would inherit its `staleTime` — five seconds in which a checkout made from the
 * graph stays invisible. `git worktree list` is a local read, and revalidating on mount is what
 * makes coming back to the board after a checkout show the right thing: switching the repo tab's
 * view unmounts the board page (`RepoWorkspace`), so returning to it asks again.
 *
 * Advisory, not authoritative: `createWorktreeForCard` re-reads the list before writing, since a
 * checkout can land between the render and the click.
 */
export function useWorktreeBranches(repoPath: string) {
  const { data, mutate } = useSWR(repoPath ? ['board-worktrees', repoPath] : null, () =>
    apiListWorktrees(repoPath)
  )
  const worktrees: GitWorktree[] = data ?? []
  const revalidateWorktrees = useCallback(() => void mutate(), [mutate])

  return {
    /**
     * The worktree already holding `branch`, or `null` — this repository's own included, which is
     * the case that matters most here.
     */
    worktreeHolding(branch: string | null | undefined): GitWorktree | null {
      if (!branch) return null
      return worktrees.find((worktree) => worktree.branch === branch) ?? null
    },
    /**
     * Re-reads the list, explicitly.
     *
     * Two callers, and neither can wait for a mount: the card's own "Create branch" **checks the new
     * branch out**, so the answer changes with that very click; and opening a card asks a question
     * whose answer may have changed in another view entirely (a checkout from the graph frees the
     * branch again). A mount-time revalidation covers neither reliably — switching back to the board
     * remounts it, but within SWR's deduping window that revalidation is dropped, and the section
     * then refuses a worktree for a branch nothing holds any more. An explicit mutate is not deduped.
     */
    revalidateWorktrees,
  }
}
