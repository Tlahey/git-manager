use crate::error::AppError;
use crate::services::git_remote;
use crate::utils::{github_branch_url, github_tag_url, github_web_url};
use git2::Repository;

pub use crate::services::git_remote::{FetchResult, PullResult, RemoteInfo};

// ─── fetch_remote ─────────────────────────────────────────────────────────────

/// Fetch from a remote (defaults to "origin"). `prune` removes tracking refs
/// (`origin/*`) whose remote branch has vanished — `git fetch --prune`.
#[tauri::command]
pub async fn fetch_remote(
    path: String,
    remote: Option<String>,
    prune: Option<bool>,
) -> Result<FetchResult, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::fetch(&repo, remote, prune.unwrap_or(false)).map_err(Into::into)
}

// ─── pull_branch ──────────────────────────────────────────────────────────────

/// Pull (fetch + fast-forward merge or rebase)
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

/// Push to the remote
#[tauri::command]
pub async fn push_branch(
    path: String,
    remote: Option<String>,
    force: Option<bool>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::push(&repo, remote, force.unwrap_or(false)).map_err(Into::into)
}

// ─── push_branch_to ───────────────────────────────────────────────────────────

/// Pushes local branch `source` to remote branch `target` (refspec `source:target`) on `remote`
/// (defaults to "origin") — drag-and-drop of one branch badge onto another.
#[tauri::command]
pub async fn push_branch_to(
    path: String,
    remote: Option<String>,
    source: String,
    target: String,
    force: Option<bool>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::push_to(&repo, remote, &source, &target, force.unwrap_or(false)).map_err(Into::into)
}

// ─── get_remotes ──────────────────────────────────────────────────────────────

/// Lists the remotes with their name (GitRepo.remotes only exposes the URLs)
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

// ─── get_commit_web_url ───────────────────────────────────────────────────────

/// Builds a commit's web URL on the given remote (defaults to "origin"), GitHub only.
/// Returns `None` if the remote isn't configured or isn't a GitHub URL.
#[tauri::command]
pub async fn get_commit_web_url(
    path: String,
    oid: String,
    remote: Option<String>,
) -> Result<Option<String>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let remote_name = remote.as_deref().unwrap_or("origin");
    let remotes = git_remote::list_remotes(&repo)?;
    let remote_info = remotes.into_iter().find(|r| r.name == remote_name);
    Ok(remote_info.and_then(|r| github_web_url(&r.url, &oid)))
}

// ─── get_tag_web_url ───────────────────────────────────────────────────────────

/// Builds a tag's release page URL on the given remote (defaults to "origin"), GitHub only.
/// Returns `None` if the remote isn't configured or isn't a GitHub URL.
#[tauri::command]
pub async fn get_tag_web_url(
    path: String,
    tag_name: String,
    remote: Option<String>,
) -> Result<Option<String>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let remote_name = remote.as_deref().unwrap_or("origin");
    let remotes = git_remote::list_remotes(&repo)?;
    let remote_info = remotes.into_iter().find(|r| r.name == remote_name);
    Ok(remote_info.and_then(|r| github_tag_url(&r.url, &tag_name)))
}

// ─── get_branch_web_url ────────────────────────────────────────────────────────

/// Builds a branch's tree page URL on the given remote (defaults to "origin"), GitHub only.
/// Returns `None` if the remote isn't configured or isn't a GitHub URL.
#[tauri::command]
pub async fn get_branch_web_url(
    path: String,
    branch_name: String,
    remote: Option<String>,
) -> Result<Option<String>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let remote_name = remote.as_deref().unwrap_or("origin");
    let remotes = git_remote::list_remotes(&repo)?;
    let remote_info = remotes.into_iter().find(|r| r.name == remote_name);
    Ok(remote_info.and_then(|r| github_branch_url(&r.url, &branch_name)))
}

// ─── delete_remote_tag ─────────────────────────────────────────────────────────

/// Deletes tag `tag_name` on `remote` (defaults to "origin") by pushing an empty-source
/// refspec — the equivalent of `git push origin :refs/tags/<name>`.
#[tauri::command]
pub async fn delete_remote_tag(
    path: String,
    tag_name: String,
    remote: Option<String>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_remote::delete_remote_tag(&repo, remote, &tag_name).map_err(Into::into)
}
