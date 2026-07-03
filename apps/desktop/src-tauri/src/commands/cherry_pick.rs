use crate::error::AppError;
use crate::services::git_cherry_pick;
use git2::Repository;

// ─── cherry_pick_commit ───────────────────────────────────────────────────────

/// Cherry-picks a commit onto the current HEAD, preserving its original author and
/// message. Returns the short SHA of the new commit.
#[tauri::command]
pub async fn cherry_pick_commit(path: String, oid: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_cherry_pick::cherry_pick_commit(&repo, &oid)
}
