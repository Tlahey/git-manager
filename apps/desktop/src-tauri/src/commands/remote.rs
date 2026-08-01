use crate::error::AppError;
use crate::hook_progress;
use crate::services::git_remote;
use crate::utils::{github_branch_url, github_tag_url, github_web_url};
use git2::Repository;
use serde::Serialize;
use tauri::Emitter;

pub use crate::services::git_remote::{
    FetchResult, PullResult, PullStrategy, RemoteInfo, RemoteProgress,
};

// ─── Transfer progress ────────────────────────────────────────────────────────

/// Event carrying a transfer's progress to the frontend.
///
/// Pushed rather than polled, and rate-limited in the service: a network transfer has no `.await`
/// point the frontend could interrogate, and the command's own promise only settles once the whole
/// thing is over — which, on the operations worth reporting, is minutes away.
pub const REMOTE_PROGRESS_EVENT: &str = "remote-progress";

/// Which operation a report belongs to. Sent as a string rather than inferred from the payload,
/// because a pull's progress is a fetch's progress and the frontend has to be able to tell the two
/// apart to label the card.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteOperation {
    Fetch,
    Pull,
    Push,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteProgressEvent {
    /// The repository the transfer belongs to — several can run at once.
    repo_path: String,
    operation: RemoteOperation,
    #[serde(flatten)]
    progress: RemoteProgress,
}

/// A progress sink that emits to the frontend, best-effort.
///
/// A failed emit is deliberately ignored: progress is decoration, and the one thing that must not
/// happen is a fetch aborting because the window it was reporting to went away.
fn progress_emitter(
    app: tauri::AppHandle,
    repo_path: String,
    operation: RemoteOperation,
) -> impl FnMut(RemoteProgress) {
    move |progress| {
        let _ = app.emit(
            REMOTE_PROGRESS_EVENT,
            RemoteProgressEvent {
                repo_path: repo_path.clone(),
                operation,
                progress,
            },
        );
    }
}

// ─── fetch_remote ─────────────────────────────────────────────────────────────

/// Fetch from a remote (defaults to "origin"). `prune` removes tracking refs
/// (`origin/*`) whose remote branch has vanished — `git fetch --prune`.
///
/// Runs on a blocking-pool thread: `git2`'s network transfer is synchronous C code with no
/// `.await` point of its own, so running it directly on this command's async task would tie up
/// one of the app's few Tokio worker threads for as long as the transfer takes — on a slow
/// connection or a large repo, long enough to stall other IPC (status polling, etc.) and make the
/// whole app look frozen. See `configure_libgit2_network_timeouts` (lib.rs) for the timeout that
/// bounds a stalled connection.
#[tauri::command]
pub async fn fetch_remote(
    app: tauri::AppHandle,
    path: String,
    remote: Option<String>,
    prune: Option<bool>,
) -> Result<FetchResult, String> {
    let repo_path = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_remote::fetch(
            &repo,
            remote,
            prune.unwrap_or(false),
            progress_emitter(app, repo_path, RemoteOperation::Fetch),
        )
    })
    .await
    .map_err(|e| format!("fetch task failed to complete: {e}"))?;

    result.map_err(Into::into)
}

// ─── pull_branch ──────────────────────────────────────────────────────────────

/// Pull: fetch, then integrate the remote branch with the chosen strategy (defaults to
/// fast-forward-if-possible, like `git pull`). See `git_remote::pull` for what each strategy does
/// on conflict — notably that none of them leave the repo in a paused, conflicted state.
///
/// Runs on a blocking-pool thread — see `fetch_remote`'s doc comment, which this shares the
/// underlying network-fetch call with.
#[tauri::command]
pub async fn pull_branch(
    app: tauri::AppHandle,
    path: String,
    remote: Option<String>,
    strategy: Option<PullStrategy>,
) -> Result<PullResult, String> {
    let repo_path = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_remote::pull(
            &repo,
            remote,
            strategy.unwrap_or_default(),
            progress_emitter(app, repo_path, RemoteOperation::Pull),
        )
    })
    .await
    .map_err(|e| format!("pull task failed to complete: {e}"))?;

    result.map_err(Into::into)
}

// ─── push_branch ──────────────────────────────────────────────────────────────

/// Push to the remote
///
/// Runs on a blocking-pool thread — see `fetch_remote`'s doc comment; the same synchronous,
/// un-awaited network transfer risk applies to a push.
#[tauri::command]
pub async fn push_branch(
    app: tauri::AppHandle,
    path: String,
    remote: Option<String>,
    force: Option<bool>,
    // `git push --no-verify` — the escape hatch for a `pre-push` hook that hangs or misfires.
    skip_hooks: Option<bool>,
) -> Result<(), String> {
    let repo_path = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        // On the thread the hook is waited on, not around the spawn — the observer is
        // thread-scoped. A `pre-push` running a test suite is the slowest thing in this command.
        let _hooks = hook_progress::report_hooks(app.clone(), repo_path.clone());
        git_remote::push(
            &repo,
            remote,
            force.unwrap_or(false),
            skip_hooks.unwrap_or(false),
            progress_emitter(app, repo_path, RemoteOperation::Push),
        )
    })
    .await
    .map_err(|e| format!("push task failed to complete: {e}"))?;

    result.map_err(Into::into)
}

// ─── push_branch_to ───────────────────────────────────────────────────────────

/// Pushes local branch `source` to remote branch `target` (refspec `source:target`) on `remote`
/// (defaults to "origin") — drag-and-drop of one branch badge onto another.
///
/// Runs on a blocking-pool thread — see `fetch_remote`'s doc comment.
#[tauri::command]
pub async fn push_branch_to(
    path: String,
    remote: Option<String>,
    source: String,
    target: String,
    force: Option<bool>,
    // `git push --no-verify`, as on every other push path.
    skip_hooks: Option<bool>,
) -> Result<(), String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_remote::push_to(
            &repo,
            remote,
            &source,
            &target,
            force.unwrap_or(false),
            skip_hooks.unwrap_or(false),
        )
    })
    .await
    .map_err(|e| format!("push task failed to complete: {e}"))?;

    result.map_err(Into::into)
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

// ─── push_tag ─────────────────────────────────────────────────────────────────

/// Publishes tag `tag_name` to `remote` (defaults to "origin") — `git push origin <name>`.
///
/// Runs on a blocking-pool thread — see `fetch_remote`'s doc comment; this is a push like any
/// other, over the same unbounded network call.
#[tauri::command]
pub async fn push_tag(
    path: String,
    tag_name: String,
    remote: Option<String>,
    // `git push --no-verify`, as on every other push path.
    skip_hooks: Option<bool>,
) -> Result<(), String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_remote::push_tag(&repo, remote, &tag_name, skip_hooks.unwrap_or(false))
    })
    .await
    .map_err(|e| format!("push task failed to complete: {e}"))?;

    result.map_err(Into::into)
}

// ─── delete_remote_branch ───────────────────────────────────────────────────────

/// Deletes branch `branch_name` on `remote` (defaults to "origin") by pushing an empty-source
/// refspec — the equivalent of `git push origin :refs/heads/<name>`.
///
/// Runs on a blocking-pool thread — see `fetch_remote`'s doc comment.
#[tauri::command]
pub async fn delete_remote_branch(
    path: String,
    branch_name: String,
    remote: Option<String>,
    // `git push --no-verify`, as on every other push path.
    skip_hooks: Option<bool>,
) -> Result<(), String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_remote::delete_remote_branch(&repo, remote, &branch_name, skip_hooks.unwrap_or(false))
    })
    .await
    .map_err(|e| format!("push task failed to complete: {e}"))?;

    result.map_err(Into::into)
}

// ─── delete_remote_tag ─────────────────────────────────────────────────────────

/// Deletes tag `tag_name` on `remote` (defaults to "origin") by pushing an empty-source
/// refspec — the equivalent of `git push origin :refs/tags/<name>`.
///
/// Runs on a blocking-pool thread — see `fetch_remote`'s doc comment.
#[tauri::command]
pub async fn delete_remote_tag(
    path: String,
    tag_name: String,
    remote: Option<String>,
    // `git push --no-verify`, as on every other push path.
    skip_hooks: Option<bool>,
) -> Result<(), String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_remote::delete_remote_tag(&repo, remote, &tag_name, skip_hooks.unwrap_or(false))
    })
    .await
    .map_err(|e| format!("push task failed to complete: {e}"))?;

    result.map_err(Into::into)
}
