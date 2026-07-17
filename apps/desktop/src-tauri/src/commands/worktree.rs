use crate::models::{GitWorktree, WorktreeAddResult};
use crate::services::git_worktree;

// ─── add_worktree ─────────────────────────────────────────────────────────────

/// Adds a new worktree at `worktree_path`, checking out `branch` (a branch name or
/// raw commit OID — e.g. "create worktree from this commit" passes the commit's OID).
///
/// `default_files` is an optional list of per-repo glob patterns for gitignored local files
/// (`.env`, local config, …) to copy from the source repo into the new worktree after it's
/// created; the returned `WorktreeAddResult` reports what was copied vs. skipped. An empty or
/// absent list does no copying.
#[tauri::command]
pub async fn add_worktree(
    path: String,
    branch: String,
    worktree_path: String,
    default_files: Option<Vec<String>>,
) -> Result<WorktreeAddResult, String> {
    git_worktree::add_worktree(&path, &worktree_path, &branch)?;
    let files = default_files.unwrap_or_default();
    git_worktree::copy_default_files(&path, &worktree_path, &files).map_err(Into::into)
}

// ─── count_default_file_matches ───────────────────────────────────────────────

/// Counts, per input glob pattern (aligned by index), how many files under `path` it matches — a
/// live preview for the worktree-creation UI. Same matching rules as the default-file copy.
#[tauri::command]
pub async fn count_default_file_matches(
    path: String,
    patterns: Vec<String>,
) -> Result<Vec<usize>, String> {
    Ok(git_worktree::count_default_file_matches(&path, &patterns))
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
