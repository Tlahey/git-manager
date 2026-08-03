import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { GitBranch, GitWorktree } from '@git-manager/git-types'
import { SidebarDialogsManager } from './SidebarDialogsManager'

vi.mock('./AddWorktreeDialog', () => ({
  AddWorktreeDialog: (p: { open: boolean; initialBranch?: string; onClose: () => void }) => (
    <div data-testid="add-worktree" data-open={p.open} data-branch={p.initialBranch ?? ''}>
      <button onClick={p.onClose}>close-add-worktree</button>
    </div>
  ),
}))
vi.mock('./RemoveWorktreeDialog', () => ({
  RemoveWorktreeDialog: (p: {
    worktree: { path: string } | null
    deleteBranch: boolean
    onClose: () => void
  }) => (
    <div
      data-testid="remove-worktree"
      data-path={p.worktree?.path ?? ''}
      data-delete={p.deleteBranch}
    >
      <button onClick={p.onClose}>close-remove-worktree</button>
    </div>
  ),
}))
vi.mock('./PruneWorktreesDialog', () => ({
  PruneWorktreesDialog: (p: { open: boolean; worktrees: { path: string }[] }) => (
    <div data-testid="prune-worktrees" data-open={p.open} data-count={p.worktrees.length} />
  ),
}))
vi.mock('./RemoveMergedWorktreesDialog', () => ({
  RemoveMergedWorktreesDialog: (p: { open: boolean; mineOnly: boolean }) => (
    <div data-testid="remove-merged-worktrees" data-open={p.open} data-mine-only={p.mineOnly} />
  ),
}))
vi.mock('./RemoveMergedBranchesDialog', () => ({
  RemoveMergedBranchesDialog: (p: { open: boolean; mineOnly: boolean }) => (
    <div data-testid="remove-merged-branches" data-open={p.open} data-mine-only={p.mineOnly} />
  ),
}))
vi.mock('./PruneBranchesDialog', () => ({
  PruneBranchesDialog: (p: { open: boolean }) => (
    <div data-testid="prune-branches" data-open={p.open} />
  ),
}))
vi.mock('../git-graph/CreateBranchHereDialog', () => ({
  CreateBranchHereDialog: (p: { open: boolean; oid: string; shortOid: string }) => (
    <div data-testid="create-branch" data-open={p.open} data-oid={p.oid} data-short={p.shortOid} />
  ),
}))
vi.mock('./CreateIssueDialog', () => ({
  CreateIssueDialog: (p: { open: boolean; onCreated: () => void }) => (
    <div data-testid="create-issue" data-open={p.open}>
      <button onClick={p.onCreated}>trigger-created</button>
    </div>
  ),
}))
vi.mock('./SavedFilterDialog', () => ({
  SavedFilterDialog: (p: { open: boolean; kind: string }) => (
    <div data-testid="saved-filter" data-open={p.open} data-kind={p.kind} />
  ),
}))

function worktree(path: string, branch = 'feat'): GitWorktree {
  return {
    path,
    branch,
    commitOid: 'sha',
    isMain: false,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
  }
}

function branch(shortName: string): GitBranch {
  return {
    name: shortName,
    shortName,
    isHead: false,
    isRemote: false,
    commitOid: 'sha',
    commitMessage: '',
    commitTimestamp: 0,
    aheadCount: 0,
    behindCount: 0,
  } as GitBranch
}

function baseProps(overrides: Partial<Parameters<typeof SidebarDialogsManager>[0]> = {}) {
  return {
    repoPath: '/repo',
    remoteUrls: [],
    worktrees: [worktree('/wt/feat')],
    prunableWorktrees: [],
    allLocalBranches: [branch('feat')],
    refreshIssues: vi.fn(),
    addWorktreeOpen: false,
    onCloseAddWorktree: vi.fn(),
    worktreeBranch: null,
    worktreeToRemove: null,
    onCloseRemoveWorktree: vi.fn(),
    removeWithBranch: false,
    pruneWorktreesOpen: false,
    onClosePruneWorktrees: vi.fn(),
    removeMergedWorktrees: null,
    onCloseRemoveMergedWorktrees: vi.fn(),
    removeMergedBranches: null,
    onCloseRemoveMergedBranches: vi.fn(),
    pruneBranchesOpen: false,
    onClosePruneBranches: vi.fn(),
    createBranchOpen: false,
    onCloseCreateBranch: vi.fn(),
    createBranchOid: 'HEAD',
    createBranchShortOid: 'abc1234',
    createIssueOpen: false,
    onCloseCreateIssue: vi.fn(),
    filterDialog: null,
    onCloseFilterDialog: vi.fn(),
    ...overrides,
  }
}

describe('SidebarDialogsManager', () => {
  it('forwards the worktree-to-remove and delete-branch flag, and wires its close handler', () => {
    const onCloseRemoveWorktree = vi.fn()
    render(
      <SidebarDialogsManager
        {...baseProps({
          worktreeToRemove: worktree('/wt/feat'),
          removeWithBranch: true,
          onCloseRemoveWorktree,
        })}
      />
    )
    const dialog = screen.getByTestId('remove-worktree')
    expect(dialog).toHaveAttribute('data-path', '/wt/feat')
    expect(dialog).toHaveAttribute('data-delete', 'true')

    fireEvent.click(screen.getByText('close-remove-worktree'))
    expect(onCloseRemoveWorktree).toHaveBeenCalledOnce()
  })

  it('opens RemoveMergedWorktreesDialog for any non-null value, and passes mineOnly only for "mine"', () => {
    const { rerender } = render(
      <SidebarDialogsManager {...baseProps({ removeMergedWorktrees: 'all' })} />
    )
    expect(screen.getByTestId('remove-merged-worktrees')).toHaveAttribute('data-open', 'true')
    expect(screen.getByTestId('remove-merged-worktrees')).toHaveAttribute('data-mine-only', 'false')

    rerender(<SidebarDialogsManager {...baseProps({ removeMergedWorktrees: 'mine' })} />)
    expect(screen.getByTestId('remove-merged-worktrees')).toHaveAttribute('data-mine-only', 'true')

    rerender(<SidebarDialogsManager {...baseProps({ removeMergedWorktrees: null })} />)
    expect(screen.getByTestId('remove-merged-worktrees')).toHaveAttribute('data-open', 'false')
  })

  it('resolves the saved-filter dialog kind/open state from filterDialog', () => {
    render(
      <SidebarDialogsManager {...baseProps({ filterDialog: { kind: 'prs', filter: null } })} />
    )
    const dialog = screen.getByTestId('saved-filter')
    expect(dialog).toHaveAttribute('data-open', 'true')
    expect(dialog).toHaveAttribute('data-kind', 'prs')
  })

  it('defaults the saved-filter dialog to closed and "issues" when nothing is pending', () => {
    render(<SidebarDialogsManager {...baseProps({ filterDialog: null })} />)
    const dialog = screen.getByTestId('saved-filter')
    expect(dialog).toHaveAttribute('data-open', 'false')
    expect(dialog).toHaveAttribute('data-kind', 'issues')
  })

  it('forwards the initial branch to the add-worktree dialog', () => {
    render(
      <SidebarDialogsManager
        {...baseProps({ addWorktreeOpen: true, worktreeBranch: 'release/1.0' })}
      />
    )
    const dialog = screen.getByTestId('add-worktree')
    expect(dialog).toHaveAttribute('data-open', 'true')
    expect(dialog).toHaveAttribute('data-branch', 'release/1.0')
  })

  it('calls refreshIssues when the create-issue dialog reports a creation', () => {
    const refreshIssues = vi.fn()
    render(<SidebarDialogsManager {...baseProps({ refreshIssues })} />)
    fireEvent.click(screen.getByText('trigger-created'))
    expect(refreshIssues).toHaveBeenCalledOnce()
  })
})
