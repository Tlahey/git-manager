import {
  listWorktrees,
  addWorktree,
  countDefaultFileMatches,
  removeWorktree,
  pruneWorktrees,
  goneUpstreamBranches,
  getWorktreeAgentActivity,
} from '../lib/tauri'

export async function apiListWorktrees(path: string) {
  return listWorktrees(path)
}

export async function apiAddWorktree(
  path: string,
  branch: string,
  worktreePath: string,
  defaultFiles?: string[]
) {
  return addWorktree(path, branch, worktreePath, defaultFiles)
}

export async function apiCountDefaultFileMatches(path: string, patterns: string[]) {
  return countDefaultFileMatches(path, patterns)
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

export async function apiGetWorktreeAgentActivity(paths: string[]) {
  return getWorktreeAgentActivity(paths)
}
