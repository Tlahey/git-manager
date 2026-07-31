use crate::error::AppError;
use git2::{IndexAddOption, Oid, Repository};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const PIN_NAMESPACE: &str = "refs/git-manager/undo/";

fn pin_ref_name(ref_name: &str) -> String {
    format!("{PIN_NAMESPACE}{ref_name}")
}

fn pin_oid(repo: &Repository, ref_name: &str, oid: Oid) -> Result<(), git2::Error> {
    repo.reference(
        &pin_ref_name(ref_name),
        oid,
        true,
        "git-manager: pin for undo history",
    )?;
    Ok(())
}

// ─── Generic pinning (used to protect an object that already exists, e.g. the
// commit behind a stash before pop/drop) ────────────────────────────────────

/// Creates/overwrites a hidden ref (`refs/git-manager/undo/<ref_name>`) pointing at `oid`, to
/// keep `git gc` from collecting it while the matching history entry still exists. Works for a
/// blob, tree, or commit OID indifferently.
#[tauri::command]
pub async fn pin_object(path: String, ref_name: String, oid: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let target_oid = Oid::from_str(&oid).map_err(|_| "Invalid OID".to_string())?;
    pin_oid(&repo, &ref_name, target_oid).map_err(AppError::Git)?;
    Ok(())
}

/// Deletes a hidden ref created by `pin_object`/the snapshot commands. Idempotent —
/// no error if the ref is already gone.
#[tauri::command]
pub async fn unpin_object(path: String, ref_name: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    if let Ok(mut reference) = repo.find_reference(&pin_ref_name(&ref_name)) {
        let _ = reference.delete();
    }
    Ok(())
}

/// Checks whether each OID exists in the local object database (without loading its content).
/// Used at startup to invalidate persisted history entries whose object has
/// disappeared (e.g. a manual `git gc` run outside the app).
#[tauri::command]
pub async fn objects_exist(path: String, oids: Vec<String>) -> Result<Vec<bool>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let odb = repo.odb().map_err(AppError::Git)?;
    let results = oids
        .iter()
        .map(|oid_str| {
            Oid::from_str(oid_str)
                .map(|oid| odb.exists(oid))
                .unwrap_or(false)
        })
        .collect();
    Ok(results)
}

// ─── Orphan file (used before discard_file_changes) ──────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshotResult {
    pub blob_oid: String,
    pub ref_name: String,
}

/// Writes a file's content as a Git blob and immediately pins the object via a hidden
/// ref (`refs/git-manager/undo/<entry_id>`) so it survives indefinitely while the
/// history entry exists. Returns `None` if the file doesn't exist (nothing to save).
#[tauri::command]
pub async fn snapshot_file(
    path: String,
    file_path: String,
    entry_id: String,
) -> Result<Option<FileSnapshotResult>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let full_path = Path::new(&path).join(&file_path);

    if !full_path.is_file() {
        return Ok(None);
    }

    let bytes = fs::read(&full_path).map_err(|e| e.to_string())?;
    let oid = repo.blob(&bytes).map_err(AppError::Git)?;
    pin_oid(&repo, &entry_id, oid).map_err(AppError::Git)?;

    Ok(Some(FileSnapshotResult {
        blob_oid: oid.to_string(),
        ref_name: entry_id,
    }))
}

/// Rewrites a file to disk from an orphan blob captured by `snapshot_file`.
#[tauri::command]
pub async fn restore_file_blob(
    path: String,
    file_path: String,
    blob_oid: String,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let oid = Oid::from_str(&blob_oid).map_err(|_| "Invalid blob OID".to_string())?;
    let blob = repo.find_blob(oid).map_err(AppError::Git)?;

    let full_path = Path::new(&path).join(&file_path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full_path, blob.content()).map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Full worktree snapshot (used before reset hard / forced checkout / stash pop-apply) ─────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeSnapshot {
    pub index_tree_oid: String,
    pub workdir_tree_oid: String,
    pub index_ref_name: String,
    pub workdir_ref_name: String,
}

fn build_worktree_snapshot(
    repo: &Repository,
    entry_id: &str,
) -> Result<WorktreeSnapshot, git2::Error> {
    let index_tree_oid = {
        let mut index = repo.index()?;
        index.write_tree()?
    };

    let workdir_tree_oid = {
        let mut index = repo.index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.write_tree()?
    };

    let index_ref_name = format!("{entry_id}/index");
    let workdir_ref_name = format!("{entry_id}/workdir");
    pin_oid(repo, &index_ref_name, index_tree_oid)?;
    pin_oid(repo, &workdir_ref_name, workdir_tree_oid)?;

    Ok(WorktreeSnapshot {
        index_tree_oid: index_tree_oid.to_string(),
        workdir_tree_oid: workdir_tree_oid.to_string(),
        index_ref_name,
        workdir_ref_name,
    })
}

/// Captures the current state of the index (staged) and the working directory (staged +
/// unstaged + untracked) as two Git trees, pinned via hidden refs. Returns `None` if
/// the repo is already clean (nothing to protect before a destructive action like
/// reset --hard or a forced checkout).
///
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

        let mut status_opts = git2::StatusOptions::new();
        status_opts
            .include_untracked(true)
            .recurse_untracked_dirs(true);
        let statuses = repo
            .statuses(Some(&mut status_opts))
            .map_err(AppError::Git)?;
        if statuses.is_empty() {
            return Ok(None);
        }

        build_worktree_snapshot(&repo, &entry_id)
            .map(Some)
            .map_err(AppError::Git)
            .map_err(String::from)
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
        build_worktree_snapshot(&repo, &entry_id)
            .map_err(AppError::Git)
            .map_err(String::from)
    })
    .await
    .map_err(|e| format!("snapshot task failed to complete: {e}"))?
}

/// Restores a snapshot captured by `snapshot_worktree`: the working directory is put back
/// into the exact state of the "workdir" tree (extra untracked files removed), and the index
/// is put back into the exact state of the "index" tree (preserving the original staged/unstaged
/// distinction).
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

        let workdir_oid =
            Oid::from_str(&workdir_tree_oid).map_err(|_| "Invalid workdir tree OID".to_string())?;
        let workdir_tree = repo.find_tree(workdir_oid).map_err(AppError::Git)?;

        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.force();
        checkout_opts.remove_untracked(true);
        repo.checkout_tree(workdir_tree.as_object(), Some(&mut checkout_opts))
            .map_err(AppError::Git)?;

        let index_oid =
            Oid::from_str(&index_tree_oid).map_err(|_| "Invalid index tree OID".to_string())?;
        let index_tree = repo.find_tree(index_oid).map_err(AppError::Git)?;
        let mut index = repo.index().map_err(AppError::Git)?;
        index.read_tree(&index_tree).map_err(AppError::Git)?;
        index.write().map_err(AppError::Git)?;

        Ok(())
    })
    .await
    .map_err(|e| format!("restore task failed to complete: {e}"))?
}

// ─── recreate_branch_ref (used for the delete_branch undo) ───────────────────

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
    let target_oid = Oid::from_str(&oid).map_err(|_| "Invalid commit OID".to_string())?;
    let commit = repo.find_commit(target_oid).map_err(AppError::Git)?;
    let mut branch = repo.branch(&name, &commit, false).map_err(AppError::Git)?;

    if let Some(upstream_name) = upstream {
        let _ = branch.set_upstream(Some(&upstream_name));
    }

    Ok(())
}
