use crate::error::AppError;
use crate::models::ThreeWayMergeView;
use crate::services::{git_conflict, git_merge_diff, git_rebase};
use git2::Repository;

/// Lists the repo's currently conflicted file paths (index `conflicts()`), used by the
/// inline conflict-resolution panel's file list.
#[tauri::command]
pub async fn list_conflicted_files(path: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_rebase::conflicted_paths(&repo).map_err(Into::into)
}

#[tauri::command]
pub async fn get_merge_view(path: String, file_path: String) -> Result<ThreeWayMergeView, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_merge_diff::get_merge_view(&repo, &path, &file_path).map_err(Into::into)
}

#[tauri::command]
pub async fn auto_merge_conflict_view(path: String, file_path: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let view: ThreeWayMergeView = git_merge_diff::get_merge_view(&repo, &path, &file_path)?;
    Ok(git_merge_diff::auto_merge_non_conflicting(&view.blocks))
}

#[tauri::command]
pub async fn resolve_conflict(
    path: String,
    file_path: String,
    resolved_content: String,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_conflict::resolve_conflict(&repo, &path, &file_path, resolved_content).map_err(Into::into)
}

#[tauri::command]
pub async fn resolve_conflict_binary(
    path: String,
    file_path: String,
    side: String,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_conflict::resolve_conflict_binary(&repo, &path, &file_path, &side).map_err(Into::into)
}
