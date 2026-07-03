use crate::error::AppError;
use crate::services::git_remote;
use git2::Repository;

pub use crate::services::git_remote::{FetchResult, PullResult, RemoteInfo};

// ─── fetch_remote ─────────────────────────────────────────────────────────────

/// Fetch depuis un remote (défaut : "origin")
#[tauri::command]
pub async fn fetch_remote(path: String, remote: Option<String>) -> Result<FetchResult, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::fetch(&repo, remote).map_err(Into::into)
}

// ─── pull_branch ──────────────────────────────────────────────────────────────

/// Pull (fetch + merge fast-forward ou rebase)
#[tauri::command]
pub async fn pull_branch(
    path: String,
    remote: Option<String>,
    rebase: Option<bool>,
) -> Result<PullResult, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::pull(&repo, remote, rebase.unwrap_or(false)).map_err(Into::into)
}

// ─── push_branch ──────────────────────────────────────────────────────────────

/// Push vers le remote
#[tauri::command]
pub async fn push_branch(
    path: String,
    remote: Option<String>,
    force: Option<bool>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::push(&repo, remote, force.unwrap_or(false)).map_err(Into::into)
}

// ─── get_remotes ──────────────────────────────────────────────────────────────

/// Liste les remotes avec leur nom (GitRepo.remotes ne fournit que les URLs)
#[tauri::command]
pub async fn get_remotes(path: String) -> Result<Vec<RemoteInfo>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::list_remotes(&repo).map_err(Into::into)
}

// ─── remove_remote ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn remove_remote(path: String, name: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::remove_remote(&repo, &name).map_err(Into::into)
}

// ─── add_remote ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn add_remote(path: String, name: String, url: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::add_remote(&repo, &name, &url).map_err(Into::into)
}
