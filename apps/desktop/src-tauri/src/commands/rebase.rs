use crate::error::AppError;
use crate::models::RebaseState;
use crate::services::git_rebase;
use git2::Repository;

/// Returns the repository's current rebase state (idle, in progress, paused on a
/// conflict, or paused on an edit/reword step), for the toolbar's "REBASING" indicator.
#[tauri::command]
pub async fn get_rebase_state(path: String) -> Result<RebaseState, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_rebase::get_rebase_state(&repo).map_err(Into::into)
}
