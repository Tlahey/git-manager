use crate::error::AppError;
use crate::services::git_rollback;
use git2::Repository;

pub use crate::services::git_rollback::CommitSummary;

// ─── revert_commit ────────────────────────────────────────────────────────────

/// Reverts a commit by applying its inverse diff to the working directory and index.
/// If no_commit is false (default), creates a new "Revert" commit.
/// Returns the short SHA of the new commit, or an empty string if no_commit = true.
///
/// `mainline` is `git revert -m`: required for a merge commit, ignored otherwise — see
/// `git_rollback::revert_commit` for why the service decides that rather than the caller.
///
/// Runs on a blocking-pool thread: applies the inverse diff to the whole working tree/index, so
/// its cost scales with the size of the commit's change — see `fetch_remote`'s doc comment for why
/// that shouldn't run directly on this command's async task.
#[tauri::command]
pub async fn revert_commit(
    path: String,
    oid: String,
    no_commit: Option<bool>,
    mainline: Option<u32>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_rollback::revert_commit(&repo, &oid, no_commit.unwrap_or(false), mainline)
    })
    .await
    .map_err(|e| format!("revert task failed to complete: {e}"))?
}

// ─── reset_to_commit ──────────────────────────────────────────────────────────

/// Resets HEAD to a given commit.
/// mode: "soft" | "mixed" | "hard"
///
/// Runs on a blocking-pool thread: a "mixed"/"hard" reset touches the whole index/working tree,
/// scaling with how much changes — see `fetch_remote`'s doc comment.
#[tauri::command]
pub async fn reset_to_commit(path: String, oid: String, mode: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_rollback::reset_to_commit(&repo, &oid, &mode)
    })
    .await
    .map_err(|e| format!("reset task failed to complete: {e}"))?
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
