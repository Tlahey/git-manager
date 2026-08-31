use crate::error::AppError;
use crate::hook_progress;
use crate::models::{GitDiff, GitDiffFile};
use crate::services::{git_commit, git_diff};
use git2::Repository;

pub use crate::services::git_commit::{CommitResult, DiscardResult};
pub use crate::services::git_diff::RawFileDiffContents;

// ─── stage_file ───────────────────────────────────────────────────────────────

/// Stages a file (adds it to the index)
#[tauri::command]
pub async fn stage_file(path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_commit::stage_file(&repo, &path, &file_path).map_err(Into::into)
}

// ─── unstage_file ─────────────────────────────────────────────────────────────

/// Unstages a file (removes it from the index)
#[tauri::command]
pub async fn unstage_file(path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_commit::unstage_file(&repo, &file_path).map_err(Into::into)
}

// ─── discard_file_changes ─────────────────────────────────────────────────────

/// Discards all unstaged changes to a file in the working directory.
///
/// Runs on a blocking-pool thread — see `stage_all`'s doc comment.
#[tauri::command]
pub async fn discard_file_changes(
    path: String,
    file_path: String,
) -> Result<DiscardResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_commit::discard_file_changes(&repo, &path, &file_path)
    })
    .await
    .map_err(|e| format!("discard task failed to complete: {e}"))?
    .map_err(Into::into)
}

// ─── stage_all ────────────────────────────────────────────────────────────────

/// Stages every modified file
///
/// Runs on a blocking-pool thread: touches the whole index/working tree, so its cost scales with
/// how much is currently changed — see `fetch_remote`'s doc comment for why that shouldn't run
/// directly on this command's async task.
#[tauri::command]
pub async fn stage_all(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_commit::stage_all(&repo)
    })
    .await
    .map_err(|e| format!("stage task failed to complete: {e}"))?
    .map_err(Into::into)
}

// ─── unstage_all ──────────────────────────────────────────────────────────────

/// Unstages every file
///
/// Runs on a blocking-pool thread — see `stage_all`'s doc comment.
#[tauri::command]
pub async fn unstage_all(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_commit::unstage_all(&repo)
    })
    .await
    .map_err(|e| format!("unstage task failed to complete: {e}"))?
    .map_err(Into::into)
}

// ─── create_commit ────────────────────────────────────────────────────────────

/// Creates a commit from the staged files. Returns the full OID and the short OID.
///
/// Runs on a blocking-pool thread, which it did not have to before this app ran hooks at all: a
/// `pre-commit` is arbitrary user code — `lint-staged` over a large change, a formatter, a test
/// gate — and waiting for it on this command's async task would tie up one of the app's few Tokio
/// workers for its whole duration, stalling the very IPC (status polling, the progress card below)
/// that is supposed to show it is running.
#[tauri::command]
pub async fn create_commit(
    app: tauri::AppHandle,
    path: String,
    message: String,
    amend: Option<bool>,
    amend_oid: Option<String>,
    skip_hooks: Option<bool>,
) -> Result<CommitResult, String> {
    let repo_path = path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        // Installed inside the closure, on the thread the hooks will actually run on — the
        // observer is thread-scoped, so installing it around the spawn would report nothing.
        let _hooks = hook_progress::report_hooks(app, repo_path);
        git_commit::create_commit(
            &repo,
            &message,
            amend.unwrap_or(false),
            amend_oid.as_deref(),
            // `git commit --no-verify`. Defaults to running them, which is the fix: libgit2 runs no
            // hook of any kind, so every repository's `pre-commit` and `commit-msg` were skipped for
            // commits made from this app.
            skip_hooks.unwrap_or(false),
        )
    })
    .await
    .map_err(|e| format!("commit task failed to complete: {e}"))?;

    result.map_err(Into::into)
}

// ─── get_staged_diff ──────────────────────────────────────────────────────────

/// Returns the staged files' diff (structured, for the UI's diff view)
///
/// Runs on a blocking-pool thread — the diff scales with how much is currently staged.
#[tauri::command]
pub async fn get_staged_diff(path: String) -> Result<GitDiff, String> {
    tauri::async_runtime::spawn_blocking(move || get_staged_diff_blocking(&path))
        .await
        .map_err(|e| format!("diff task failed to complete: {e}"))?
}

fn get_staged_diff_blocking(path: &str) -> Result<GitDiff, String> {
    let repo = Repository::open(path).map_err(AppError::Git)?;
    git_diff::staged_diff(&repo).map_err(Into::into)
}

// ─── get_file_diff ────────────────────────────────────────────────────────────

/// Returns a specific file's diff (staged, unstaged, or from a historical commit).
///
/// `base_oid`, when present, scopes the diff to a multi-commit range: the left side becomes the
/// first-parent tree of `base_oid` (the oldest selected commit) instead of `oid`'s own first
/// parent — matching the merged-range diff shown when several commits are selected together.
///
/// The `oid` branch's own diff work runs on a blocking-pool thread; the `staged`/working-tree
/// branches delegate to `get_staged_diff`/`workdir_diff`, which already thread their own work.
#[tauri::command]
pub async fn get_file_diff(
    path: String,
    file_path: String,
    staged: bool,
    oid: Option<String>,
    base_oid: Option<String>,
) -> Result<GitDiffFile, String> {
    let full_diff = if let Some(oid_str) = oid {
        tauri::async_runtime::spawn_blocking(move || {
            commit_diff_blocking(&path, &oid_str, base_oid.as_deref())
        })
        .await
        .map_err(|e| format!("diff task failed to complete: {e}"))??
    } else if staged {
        get_staged_diff(path).await?
    } else {
        workdir_diff(path).await?
    };

    full_diff
        .files
        .into_iter()
        .find(|f| f.new_path == file_path || f.old_path == file_path)
        .ok_or_else(|| {
            String::from(AppError::Unknown(format!(
                "File not found in diff: {file_path}"
            )))
        })
}

fn commit_diff_blocking(
    path: &str,
    oid_str: &str,
    base_oid: Option<&str>,
) -> Result<GitDiff, String> {
    let repo = Repository::open(path).map_err(AppError::Git)?;
    // With no base_oid, the "before" side is this commit's own first parent — the same
    // reading as a merged range whose base and head are the same commit.
    git_diff::merged_commits_diff(&repo, base_oid.unwrap_or(oid_str), oid_str).map_err(Into::into)
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/// Runs on a blocking-pool thread — the diff scales with the size of the working tree's changes.
async fn workdir_diff(path: String) -> Result<GitDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_diff::unstaged_diff(&repo).map_err(Into::into)
    })
    .await
    .map_err(|e| format!("diff task failed to complete: {e}"))?
}

/// Returns a file's raw content on both sides of the diff view (staged, unstaged, or from a
/// historical commit). See `git_diff::raw_file_contents` for the resolution rules and `base_oid`'s
/// multi-commit-range meaning.
#[tauri::command]
pub async fn get_file_raw_contents(
    path: String,
    file_path: String,
    staged: bool,
    oid: Option<String>,
    base_oid: Option<String>,
) -> Result<RawFileDiffContents, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_diff::raw_file_contents(
        &repo,
        &path,
        &file_path,
        staged,
        oid.as_deref(),
        base_oid.as_deref(),
    )
    .map_err(Into::into)
}

/// Returns the target commit's version of `file_path` (left) and the current
/// working-tree version (right), for the fixup "Commit changes" diff. Unlike
/// `get_file_raw_contents`, `original` is the file at `oid`'s own tree (not its
/// parent), so the diff shows how the working copy differs from the fixup target.
///
/// Runs on a blocking-pool thread — bounded by the target file's size, but not otherwise.
#[tauri::command]
pub async fn get_commit_file_vs_workdir(
    path: String,
    oid: String,
    file_path: String,
) -> Result<RawFileDiffContents, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_diff::commit_file_vs_workdir(&repo, &path, &oid, &file_path)
    })
    .await
    .map_err(|e| format!("diff task failed to complete: {e}"))?
    .map_err(Into::into)
}
