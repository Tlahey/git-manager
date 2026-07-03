import { listWorktrees, addWorktree, removeWorktree } from '../lib/tauri'

export async function apiListWorktrees(path: string) {
  return listWorktrees(path)
}

export async function apiAddWorktree(path: string, branch: string, worktreePath: string) {
  return addWorktree(path, branch, worktreePath)
}

export async function apiRemoveWorktree(path: string, worktreePath: string, force = false) {
  return removeWorktree(path, worktreePath, force)
}
