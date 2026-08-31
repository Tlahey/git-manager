use crate::error::AppError;
use crate::services::git_submodule;
use git2::Repository;

pub use crate::services::git_submodule::GitSubmodule;

// ─── Command ──────────────────────────────────────────────────────────────────

/// Lists the repository's submodules.
#[tauri::command]
pub async fn list_submodules(path: String) -> Result<Vec<GitSubmodule>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_submodule::list_submodules(&repo).map_err(Into::into)
}
