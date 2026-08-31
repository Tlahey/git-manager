use crate::error::AppError;
use crate::services::git_undo;
use git2::Repository;
use std::path::Path;

pub use crate::services::git_undo::{FileSnapshotResult, WorktreeSnapshot};

#[tauri::command]
pub async fn resolve_revision(path: String, revision: String) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_undo::resolve_revision(&repo, &revision)
}

#[tauri::command]
pub async fn pin_object(path: String, ref_name: String, oid: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_undo::pin_object(&repo, &ref_name, &oid)
}

#[tauri::command]
pub async fn unpin_object(path: String, ref_name: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_undo::unpin_object(&repo, &ref_name);
    Ok(())
}

#[tauri::command]
pub async fn objects_exist(path: String, oids: Vec<String>) -> Result<Vec<bool>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_undo::objects_exist(&repo, &oids)
}

#[tauri::command]
pub async fn snapshot_file(
    path: String,
    file_path: String,
    entry_id: String,
) -> Result<Option<FileSnapshotResult>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let full_path = Path::new(&path).join(&file_path);
    git_undo::snapshot_file(&repo, &full_path, &entry_id)
}

#[tauri::command]
pub async fn restore_file_blob(
    path: String,
    file_path: String,
    blob_oid: String,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let full_path = Path::new(&path).join(&file_path);
    git_undo::restore_file_blob(&repo, &full_path, &blob_oid)
}

/// Runs on a blocking-pool thread: `add_all`/`write_tree` walk the whole working tree, so the
/// cost scales with its size — see `fetch_remote`'s doc comment for why that shouldn't run
/// directly on this command's async task, given it fires before nearly every destructive action.
#[tauri::command]
pub async fn snapshot_worktree(
    path: String,
    entry_id: String,
) -> Result<Option<WorktreeSnapshot>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_undo::snapshot_worktree_if_dirty(&repo, &entry_id)
    })
    .await
    .map_err(|e| format!("snapshot task failed to complete: {e}"))?
}

/// Like `snapshot_worktree`, but always captures (even if the workdir is clean) — used
/// for the stash apply/pop undo, where the "clean" baseline is itself the state to restore.
///
/// Runs on a blocking-pool thread — see `snapshot_worktree`'s doc comment.
#[tauri::command]
pub async fn snapshot_worktree_always(
    path: String,
    entry_id: String,
) -> Result<WorktreeSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_undo::snapshot_worktree_always(&repo, &entry_id)
    })
    .await
    .map_err(|e| format!("snapshot task failed to complete: {e}"))?
}

/// Restores a snapshot captured by `snapshot_worktree`.
///
/// Runs on a blocking-pool thread — `checkout_tree` walks and writes the whole working tree, so
/// its cost scales with the size of what's being restored (see `fetch_remote`'s doc comment).
#[tauri::command]
pub async fn restore_worktree_snapshot(
    path: String,
    index_tree_oid: String,
    workdir_tree_oid: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_undo::restore_worktree_snapshot(&repo, &index_tree_oid, &workdir_tree_oid)
    })
    .await
    .map_err(|e| format!("restore task failed to complete: {e}"))?
}

/// Recreates a local branch ref pointing at a given OID, with an optional upstream.
/// Internal utility for the `delete_branch` undo — does not implement the generic
/// `create_branch` command expected elsewhere by the UI (out of scope, see the plan).
#[tauri::command]
pub async fn recreate_branch_ref(
    path: String,
    name: String,
    oid: String,
    upstream: Option<String>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_undo::recreate_branch_ref(&repo, &name, &oid, upstream.as_deref())
}
