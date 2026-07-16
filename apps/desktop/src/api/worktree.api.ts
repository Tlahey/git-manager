import {
  listWorktrees,
  addWorktree,
  removeWorktree,
  pruneWorktrees,
  goneUpstreamBranches,
} from '../lib/tauri'

export async function apiListWorktrees(path: string) {
  return listWorktrees(path)
}

export async function apiAddWorktree(path: string, branch: string, worktreePath: string) {
  return addWorktree(path, branch, worktreePath)
}

export async function apiRemoveWorktree(path: string, worktreePath: string, force = false) {
  return removeWorktree(path, worktreePath, force)
}

export async function apiPruneWorktrees(path: string) {
  return pruneWorktrees(path)
}

export async function apiGoneUpstreamBranches(path: string) {
  return goneUpstreamBranches(path)
}
