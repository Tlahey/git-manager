use crate::error::AppError;
use crate::services::git_blame;
use git2::Repository;

pub use crate::services::git_blame::{BlameHunk, FileHistoryEntry};

/// Blames `file_path` at `oid` (or HEAD when omitted), returning contiguous same-commit line runs.
///
/// Runs on a blocking-pool thread: blame walks the file's full commit history, one of `git2`'s
/// classically slow operations on a file with a long history — see `fetch_remote`'s doc comment
/// for why that shouldn't run directly on this command's async task.
#[tauri::command]
pub async fn git_blame_file(
    path: String,
    file_path: String,
    oid: Option<String>,
) -> Result<Vec<BlameHunk>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_blame::blame_file(&repo, &file_path, oid.as_deref())
    })
    .await
    .map_err(|e| format!("blame task failed to complete: {e}"))?
    .map_err(Into::into)
}

/// Returns the commits that modified `file_path`, newest first (equivalent to `git log -- <path>`).
///
/// Runs on a blocking-pool thread — see `git_blame_file`'s doc comment.
#[tauri::command]
pub async fn get_file_history(
    path: String,
    file_path: String,
    limit: Option<usize>,
) -> Result<Vec<FileHistoryEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_blame::file_history(&repo, &file_path, limit)
    })
    .await
    .map_err(|e| format!("blame task failed to complete: {e}"))?
    .map_err(Into::into)
}
