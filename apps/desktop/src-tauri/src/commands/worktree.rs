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

// ─── prune_worktrees ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn prune_worktrees(path: String) -> Result<(), String> {
    git_worktree::prune_worktrees(&path).map_err(Into::into)
}

// ─── gone_upstream_branches ───────────────────────────────────────────────────

/// Returns local branch names whose upstream remote branch no longer exists ("gone") — a local
/// signal that the branch was merged and its remote counterpart deleted/pruned, so a worktree on
/// it is eligible for bulk removal. Complements the frontend's GitHub pull-request lookup.
#[tauri::command]
pub async fn gone_upstream_branches(path: String) -> Result<Vec<String>, String> {
    git_worktree::gone_upstream_branches(&path).map_err(Into::into)
}
