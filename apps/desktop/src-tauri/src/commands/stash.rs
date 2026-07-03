use crate::error::AppError;
use crate::models::GitStash;
use crate::services::git_stash;
use git2::Repository;

/// Creates a git stash
#[tauri::command]
pub async fn stash_push(
    path: String,
    message: Option<String>,
    include_untracked: Option<bool>,
) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;
    git_stash::stash_push(&mut repo, message.as_deref(), include_untracked.unwrap_or(false))
}

/// Applies a stash and removes it from the list
#[tauri::command]
pub async fn stash_pop(path: String, index: Option<usize>) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;
    git_stash::stash_pop(&mut repo, index.unwrap_or(0))
}

/// Applies a stash without removing it from the list
#[tauri::command]
pub async fn stash_apply(path: String, index: Option<usize>) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;
    git_stash::stash_apply(&mut repo, index.unwrap_or(0))
}

/// Drops a stash from the list by index
#[tauri::command]
pub async fn stash_drop(path: String, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;
    git_stash::stash_drop(&mut repo, index)
}

/// Lists all stashes in the repository
#[tauri::command]
pub async fn stash_list(path: String) -> Result<Vec<GitStash>, String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;
    git_stash::list_stashes(&mut repo)
}

/// Re-stores a commit as a new stash entry (top of stack) — used to undo a stash
/// pop/drop by recreating the entry from its previously-captured commit OID.
#[tauri::command]
pub async fn stash_store(path: String, commit_oid: String, message: String) -> Result<(), String> {
    git_stash::run_stash_store(&path, &commit_oid, &message)
}

/// Modifies the message of a stash at the given index
#[tauri::command]
pub async fn edit_stash_message(
    path: String,
    index: usize,
    message: String,
) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(|e| AppError::Git(e).to_string())?;
    git_stash::edit_stash_message(&mut repo, &path, index, &message)
}
