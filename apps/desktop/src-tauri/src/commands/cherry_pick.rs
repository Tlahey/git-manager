use crate::error::AppError;
use crate::services::git_cherry_pick;
use git2::Repository;

// ─── cherry_pick_commit ───────────────────────────────────────────────────────

/// Cherry-picks a commit onto the current HEAD, preserving its original author and
/// message. Returns the short SHA of the new commit.
///
/// Runs on a blocking-pool thread: applies the commit's diff to the whole working tree/index, so
/// its cost scales with the size of the change — see `fetch_remote`'s doc comment.
#[tauri::command]
pub async fn cherry_pick_commit(path: String, oid: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_cherry_pick::cherry_pick_commit(&repo, &oid)
    })
    .await
    .map_err(|e| format!("cherry-pick task failed to complete: {e}"))?
}
