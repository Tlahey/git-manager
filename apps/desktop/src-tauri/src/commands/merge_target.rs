use crate::error::AppError;
use crate::services::git_merge_target;
use git2::Repository;

pub use crate::services::git_merge_target::MergeTargetStatus;

/// Returns how the checked-out branch relates to its merge target — the first entry of
/// `candidates` that exists in the repo (the frontend passes the repo's configured target
/// branches, `origin/main` by default). The merge is only simulated in memory; the repo is left
/// untouched.
#[tauri::command]
pub async fn get_merge_target_status(
    path: String,
    candidates: Vec<String>,
) -> Result<MergeTargetStatus, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_merge_target::get_merge_target_status(&repo, &candidates).map_err(Into::into)
}
