//! Tracked-file listings for a repository, delegating to `services::git_files`.

use crate::error::AppError;
use git2::Repository;

/// Returns the repository's tracked file paths (equivalent to `git ls-files`), sorted and
/// de-duplicated. Powers the command palette's "open a file" lookup.
#[tauri::command]
pub async fn list_tracked_files(path: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    crate::services::git_files::list_tracked_files(&repo).map_err(Into::into)
}

/// Returns the repository's tracked files that still exist on disk. Powers the project files
/// explorer, whose listing is deliberately the set of files git tracks rather than the contents of
/// the working directory — see `list_tracked_files_on_disk` for why.
#[tauri::command]
pub async fn get_repo_files(path: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&path).map_err(|_| AppError::RepoNotFound(path))?;
    crate::services::git_files::list_tracked_files_on_disk(&repo).map_err(Into::into)
}
