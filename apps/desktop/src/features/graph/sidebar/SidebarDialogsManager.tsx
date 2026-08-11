import type { GitBranch, GitWorktree } from '@git-manager/git-types'
import { AddWorktreeDialog } from './AddWorktreeDialog'
import { RemoveWorktreeDialog } from './RemoveWorktreeDialog'
import { PruneWorktreesDialog } from './PruneWorktreesDialog'
import { RemoveMergedWorktreesDialog } from './RemoveMergedWorktreesDialog'
import { RemoveMergedBranchesDialog } from './RemoveMergedBranchesDialog'
import { PruneBranchesDialog } from './PruneBranchesDialog'
import { CreateBranchHereDialog } from '../components/CreateBranchHereDialog'
import { CreateIssueDialog } from './CreateIssueDialog'
import { SavedFilterDialog } from './SavedFilterDialog'
import { useIssueFiltersStore } from '../stores/issueFilters.store'
import { usePrFiltersStore } from '../stores/prFilters.store'
import type { SavedFilter } from '../stores/savedFilters'

interface SidebarDialogsManagerProps {
  repoPath: string
  remoteUrls: string[]
  currentUser?: string
  githubAccountId?: string
  worktrees: GitWorktree[]
  prunableWorktrees: GitWorktree[]
  allLocalBranches: GitBranch[]
  refreshIssues: () => void

  addWorktreeOpen: boolean
  onCloseAddWorktree: () => void
  /** Branch the worktree dialog opens on when raised from a pull request; `null` falls back to the
   *  current branch. */
  worktreeBranch: string | null

  worktreeToRemove: GitWorktree | null
  onCloseRemoveWorktree: () => void
  /** Whether the pending removal should also delete the worktree's branch — the two menu entries
   *  share one dialog, which only differs by this flag. */
  removeWithBranch: boolean

  pruneWorktreesOpen: boolean
  onClosePruneWorktrees: () => void

  /** `null` = closed; `'all'` / `'mine'` = open, filtered to the current user's merged PRs when `'mine'`. */
  removeMergedWorktrees: null | 'all' | 'mine'
  onCloseRemoveMergedWorktrees: () => void

  removeMergedBranches: null | 'all' | 'mine'
  onCloseRemoveMergedBranches: () => void

  pruneBranchesOpen: boolean
  onClosePruneBranches: () => void

  createBranchOpen: boolean
  onCloseCreateBranch: () => void
  createBranchOid: string
  createBranchShortOid: string

  createIssueOpen: boolean
  onCloseCreateIssue: () => void

  /** `null` = closed. `filter: null` opens the dialog on a new one; `kind` names the list it
   *  belongs to. A plain boolean couldn't tell "add" from "edit the first filter", nor issues from
   *  PRs. */
  filterDialog: { kind: 'issues' | 'prs'; filter: SavedFilter | null } | null
  onCloseFilterDialog: () => void
}

/**
 * Renders the 9 dialogs the sidebar's section headers and rows can open — add/remove/prune
 * worktree, remove-merged worktrees/branches, prune branches, create branch/issue, and the saved
 * issue/PR filter dialog. Each dialog's open/closed state is still owned by
 * {@link RepositorySidebar} itself (it's what the section headers' and rows' own click handlers
 * set), so this component only takes that state as props and resolves it into the right dialog —
 * the same split {@link GitGraphOverlayManager}/{@link TagDialogsManager} use for the graph's own
 * dialogs (2026-08 retrofit, see architecture-guardian skill's R3).
 */
export function SidebarDialogsManager({
  repoPath,
  remoteUrls,
  currentUser,
  githubAccountId,
  worktrees,
  prunableWorktrees,
  allLocalBranches,
  refreshIssues,
  addWorktreeOpen,
  onCloseAddWorktree,
  worktreeBranch,
  worktreeToRemove,
  onCloseRemoveWorktree,
  removeWithBranch,
  pruneWorktreesOpen,
  onClosePruneWorktrees,
  removeMergedWorktrees,
  onCloseRemoveMergedWorktrees,
  removeMergedBranches,
  onCloseRemoveMergedBranches,
  pruneBranchesOpen,
  onClosePruneBranches,
  createBranchOpen,
  onCloseCreateBranch,
  createBranchOid,
  createBranchShortOid,
  createIssueOpen,
  onCloseCreateIssue,
  filterDialog,
  onCloseFilterDialog,
}: SidebarDialogsManagerProps) {
  return (
    <>
      <AddWorktreeDialog
        repoPath={repoPath}
        open={addWorktreeOpen}
        initialBranch={worktreeBranch ?? undefined}
        onClose={onCloseAddWorktree}
      />
      <RemoveWorktreeDialog
        repoPath={repoPath}
        worktree={worktreeToRemove}
        deleteBranch={removeWithBranch}
        onClose={onCloseRemoveWorktree}
      />
      <PruneWorktreesDialog
        repoPath={repoPath}
        worktrees={prunableWorktrees}
        open={pruneWorktreesOpen}
        onClose={onClosePruneWorktrees}
      />
      <RemoveMergedWorktreesDialog
        repoPath={repoPath}
        worktrees={worktrees}
        remoteUrls={remoteUrls}
        githubAccountId={githubAccountId}
        mineOnly={removeMergedWorktrees === 'mine'}
        currentUser={currentUser}
        open={removeMergedWorktrees !== null}
        onClose={onCloseRemoveMergedWorktrees}
      />
      <RemoveMergedBranchesDialog
        repoPath={repoPath}
        branches={allLocalBranches}
        worktreeBranches={worktrees.map((w) => w.branch)}
        remoteUrls={remoteUrls}
        githubAccountId={githubAccountId}
        mineOnly={removeMergedBranches === 'mine'}
        currentUser={currentUser}
        open={removeMergedBranches !== null}
        onClose={onCloseRemoveMergedBranches}
      />
      <PruneBranchesDialog
        repoPath={repoPath}
        branches={allLocalBranches}
        worktreeBranches={worktrees.map((w) => w.branch)}
        open={pruneBranchesOpen}
        onClose={onClosePruneBranches}
      />
      <CreateBranchHereDialog
        repoPath={repoPath}
        oid={createBranchOid}
        shortOid={createBranchShortOid}
        open={createBranchOpen}
        onClose={onCloseCreateBranch}
      />
      <CreateIssueDialog
        repoPath={repoPath}
        open={createIssueOpen}
        onClose={onCloseCreateIssue}
        onCreated={refreshIssues}
      />
      <SavedFilterDialog
        open={filterDialog !== null}
        kind={filterDialog?.kind ?? 'issues'}
        filter={filterDialog?.filter ?? null}
        useStore={filterDialog?.kind === 'prs' ? usePrFiltersStore : useIssueFiltersStore}
        onClose={onCloseFilterDialog}
      />
    </>
  )
}
