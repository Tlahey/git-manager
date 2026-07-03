use crate::error::AppError;
use crate::services::git_rollback;
use git2::Repository;

pub use crate::services::git_rollback::CommitSummary;

// ─── revert_commit ────────────────────────────────────────────────────────────

/// Reverts a commit by applying its inverse diff to the working directory and index.
/// If no_commit is false (default), creates a new "Revert" commit.
/// Returns the short SHA of the new commit, or an empty string if no_commit = true.
#[tauri::command]
pub async fn revert_commit(
    path: String,
    oid: String,
    no_commit: Option<bool>,
) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_rollback::revert_commit(&repo, &oid, no_commit.unwrap_or(false))
}

// ─── reset_to_commit ──────────────────────────────────────────────────────────

/// Resets HEAD to a given commit.
/// mode: "soft" | "mixed" | "hard"
#[tauri::command]
pub async fn reset_to_commit(path: String, oid: String, mode: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_rollback::reset_to_commit(&repo, &oid, &mode)
}

// ─── get_commits_between ──────────────────────────────────────────────────────

/// Returns commits reachable from `from_oid` (or HEAD if "HEAD") but not from `to_oid`.
/// This represents commits that would be undone by a reset to `to_oid`.
#[tauri::command]
pub async fn get_commits_between(
    path: String,
    from_oid: String,
    to_oid: String,
) -> Result<Vec<CommitSummary>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_rollback::get_commits_between(&repo, &from_oid, &to_oid)
}
