use crate::error::AppError;
use crate::services::git_blame;
use git2::Repository;

pub use crate::services::git_blame::{BlameHunk, FileHistoryEntry};

/// Blames `file_path` at `oid` (or HEAD when omitted), returning contiguous same-commit line runs.
#[tauri::command]
pub async fn git_blame_file(
    path: String,
    file_path: String,
    oid: Option<String>,
) -> Result<Vec<BlameHunk>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_blame::blame_file(&repo, &file_path, oid.as_deref()).map_err(Into::into)
}

/// Returns the commits that modified `file_path`, newest first (equivalent to `git log -- <path>`).
#[tauri::command]
pub async fn get_file_history(
    path: String,
    file_path: String,
    limit: Option<usize>,
) -> Result<Vec<FileHistoryEntry>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_blame::file_history(&repo, &file_path, limit).map_err(Into::into)
}
