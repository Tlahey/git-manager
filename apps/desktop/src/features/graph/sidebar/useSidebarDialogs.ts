import { useCallback, useState } from 'react'
import type { GitWorktree } from '@git-manager/git-types'
import type { SavedFilter } from '../stores/savedFilters'

/**
 * The open/closed state of the nine dialogs the sidebar can raise, and the openers its section
 * headers and rows call.
 *
 * Extracted from {@link RepositorySidebar} because it was eleven `useState`s and twenty-two props
 * threaded through the component for one reason only — the dialogs are *mounted* by
 * {@link SidebarDialogsManager} but *opened* from the headers and rows above it. That reason has
 * nothing to do with the panel's layout, its search box or its sections, which is everything else
 * that component does.
 *
 * `state` is passed straight through to the manager; every opener is memoized because some of them
 * are handed to menu hooks that keep them in their own dependency lists.
 */
export function useSidebarDialogs() {
  const [addWorktreeOpen, setAddWorktreeOpen] = useState(false)
  // Branch the worktree dialog opens on when it was raised from a pull request; null for the
  // section header's "+", which falls back to the current branch.
  const [worktreeBranch, setWorktreeBranch] = useState<string | null>(null)
  const [worktreeToRemove, setWorktreeToRemove] = useState<GitWorktree | null>(null)
  // Whether the pending removal should also delete the worktree's branch — the two menu entries
  // share one dialog, which only differs by this flag.
  const [removeWithBranch, setRemoveWithBranch] = useState(false)
  const [pruneWorktreesOpen, setPruneWorktreesOpen] = useState(false)
  // null = closed; 'all' / 'mine' = open, filtered to the current user's merged PRs when 'mine'.
  const [removeMergedWorktrees, setRemoveMergedWorktrees] = useState<null | 'all' | 'mine'>(null)
  const [removeMergedBranches, setRemoveMergedBranches] = useState<null | 'all' | 'mine'>(null)
  const [pruneBranchesOpen, setPruneBranchesOpen] = useState(false)
  const [createBranchOpen, setCreateBranchOpen] = useState(false)
  const [createIssueOpen, setCreateIssueOpen] = useState(false)
  // null = closed. `filter: null` opens the dialog on a new one; `kind` names the list it belongs
  // to. A plain boolean couldn't tell "add" from "edit the first filter", nor issues from PRs.
  const [filterDialog, setFilterDialog] = useState<{
    kind: 'issues' | 'prs'
    filter: SavedFilter | null
  } | null>(null)

  /** Opens the add-worktree dialog on `branch`, or on the current branch when `null`. */
  const openAddWorktree = useCallback((branch: string | null) => {
    setWorktreeBranch(branch)
    setAddWorktreeOpen(true)
  }, [])

  /** Opens the remove-worktree confirmation; `withBranch` also deletes the branch it had out. */
  const openRemoveWorktree = useCallback((wt: GitWorktree, withBranch: boolean) => {
    setRemoveWithBranch(withBranch)
    setWorktreeToRemove(wt)
  }, [])

  const openSavedFilter = useCallback((kind: 'issues' | 'prs', filter: SavedFilter | null) => {
    setFilterDialog({ kind, filter })
  }, [])

  return {
    open: {
      addWorktree: openAddWorktree,
      removeWorktree: openRemoveWorktree,
      pruneWorktrees: () => setPruneWorktreesOpen(true),
      removeMergedWorktrees: (scope: 'all' | 'mine') => setRemoveMergedWorktrees(scope),
      removeMergedBranches: (scope: 'all' | 'mine') => setRemoveMergedBranches(scope),
      pruneBranches: () => setPruneBranchesOpen(true),
      createBranch: () => setCreateBranchOpen(true),
      createIssue: () => setCreateIssueOpen(true),
      savedFilter: openSavedFilter,
    },
    /** Spread straight into `SidebarDialogsManager` — every prop of it this hook owns. */
    state: {
      addWorktreeOpen,
      onCloseAddWorktree: () => setAddWorktreeOpen(false),
      worktreeBranch,
      worktreeToRemove,
      onCloseRemoveWorktree: () => setWorktreeToRemove(null),
      removeWithBranch,
      pruneWorktreesOpen,
      onClosePruneWorktrees: () => setPruneWorktreesOpen(false),
      removeMergedWorktrees,
      onCloseRemoveMergedWorktrees: () => setRemoveMergedWorktrees(null),
      removeMergedBranches,
      onCloseRemoveMergedBranches: () => setRemoveMergedBranches(null),
      pruneBranchesOpen,
      onClosePruneBranches: () => setPruneBranchesOpen(false),
      createBranchOpen,
      onCloseCreateBranch: () => setCreateBranchOpen(false),
      createIssueOpen,
      onCloseCreateIssue: () => setCreateIssueOpen(false),
      filterDialog,
      onCloseFilterDialog: () => setFilterDialog(null),
    },
  }
}
