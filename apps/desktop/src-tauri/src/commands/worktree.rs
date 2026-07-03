use crate::models::GitWorktree;
use crate::services::git_worktree;

// ─── add_worktree ─────────────────────────────────────────────────────────────

/// Adds a new worktree at `worktree_path`, checking out `branch` (a branch name or
/// raw commit OID — e.g. "create worktree from this commit" passes the commit's OID).
#[tauri::command]
pub async fn add_worktree(
    path: String,
    branch: String,
    worktree_path: String,
) -> Result<(), String> {
    git_worktree::add_worktree(&path, &worktree_path, &branch).map_err(Into::into)
}

// ─── list_worktrees ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_worktrees(path: String) -> Result<Vec<GitWorktree>, String> {
    git_worktree::list_worktrees(&path).map_err(Into::into)
}

// ─── remove_worktree ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn remove_worktree(
    path: String,
    worktree_path: String,
    force: Option<bool>,
) -> Result<(), String> {
    git_worktree::remove_worktree(&path, &worktree_path, force.unwrap_or(false)).map_err(Into::into)
}
