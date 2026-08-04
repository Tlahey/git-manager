use crate::error::AppError;
use crate::hook_progress;
use crate::models::{GitDiff, GitDiffFile};
use crate::services::{git_commit, git_diff};
use git2::{DiffOptions, Oid, Repository};
use serde::Serialize;

pub use crate::services::git_commit::{CommitResult, DiscardResult};

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

    let head_tree = match repo.head() {
        Ok(head_ref) => {
            let head_commit = head_ref.peel_to_commit().map_err(AppError::Git)?;
            Some(head_commit.tree().map_err(AppError::Git)?)
        }
        Err(_) => None, // No commits yet on a brand new repo
    };

    let diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, None)
        .map_err(AppError::Git)?;

    git_diff::build_diff(diff).map_err(|e| AppError::Git(e).into())
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
    let commit_oid = Oid::from_str(oid_str).map_err(AppError::Git)?;
    let commit = repo.find_commit(commit_oid).map_err(AppError::Git)?;

    let commit_tree = commit.tree().map_err(AppError::Git)?;
    // The "before" side: for a merged range it's the oldest selected commit's first parent;
    // otherwise it's this commit's own first parent.
    let base_commit = match base_oid {
        Some(b) => repo
            .find_commit(Oid::from_str(b).map_err(AppError::Git)?)
            .map_err(AppError::Git)?,
        None => commit.clone(),
    };
    let parent_tree = if base_commit.parent_count() > 0 {
        let parent = base_commit.parent(0).map_err(AppError::Git)?;
        Some(parent.tree().map_err(AppError::Git)?)
    } else {
        None
    };

    let mut diff_opts = DiffOptions::new();
    diff_opts.context_lines(3).ignore_whitespace_change(false);

    let diff = repo
        .diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&commit_tree),
            Some(&mut diff_opts),
        )
        .map_err(AppError::Git)?;

    git_diff::build_diff(diff).map_err(|e| AppError::Git(e).into())
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/// Runs on a blocking-pool thread — the diff scales with the size of the working tree's changes.
async fn workdir_diff(path: String) -> Result<GitDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        let mut opts = DiffOptions::new();
        opts.include_untracked(false);

        let diff = repo
            .diff_index_to_workdir(None, Some(&mut opts))
            .map_err(AppError::Git)?;

        git_diff::build_diff(diff).map_err(|e| AppError::Git(e).into())
    })
    .await
    .map_err(|e| format!("diff task failed to complete: {e}"))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawFileDiffContents {
    pub original: String,
    pub modified: String,
}

#[tauri::command]
pub async fn get_file_raw_contents(
    path: String,
    file_path: String,
    staged: bool,
    oid: Option<String>,
    base_oid: Option<String>,
) -> Result<RawFileDiffContents, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;

    let original = if let Some(ref oid_str) = oid {
        // For a merged range the "before" side is the oldest selected commit's first parent
        // (`base_oid`); otherwise it's this commit's own first parent.
        let base_oid_str = base_oid.as_ref().unwrap_or(oid_str);
        let base_commit_oid = Oid::from_str(base_oid_str).map_err(|e| e.to_string())?;
        let commit = repo
            .find_commit(base_commit_oid)
            .map_err(|e| e.to_string())?;
        if commit.parent_count() > 0 {
            let parent = commit.parent(0).map_err(|e| e.to_string())?;
            get_file_content_from_tree(
                &repo,
                &parent.tree().map_err(|e| e.to_string())?,
                &file_path,
            )?
        } else {
            String::new()
        }
    } else if staged {
        if let Ok(head) = repo.head() {
            if let Ok(resolved) = head.resolve() {
                if let Ok(commit) = resolved.peel_to_commit() {
                    get_file_content_from_tree(
                        &repo,
                        &commit.tree().map_err(|e| e.to_string())?,
                        &file_path,
                    )
                    .unwrap_or_default()
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        get_file_content_from_index(&repo, &file_path).unwrap_or_else(|_| {
            if let Ok(head) = repo.head() {
                if let Ok(resolved) = head.resolve() {
                    if let Ok(commit) = resolved.peel_to_commit() {
                        if let Ok(tree) = commit.tree() {
                            get_file_content_from_tree(&repo, &tree, &file_path).unwrap_or_default()
                        } else {
                            String::new()
                        }
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        })
    };

    let modified = if let Some(ref oid_str) = oid {
        let commit_oid = Oid::from_str(oid_str).map_err(|e| e.to_string())?;
        let commit = repo.find_commit(commit_oid).map_err(|e| e.to_string())?;
        get_file_content_from_tree(
            &repo,
            &commit.tree().map_err(|e| e.to_string())?,
            &file_path,
        )?
    } else if staged {
        get_file_content_from_index(&repo, &file_path).unwrap_or_default()
    } else {
        let full_path = std::path::Path::new(&path).join(&file_path);
        match std::fs::read(&full_path) {
            Ok(bytes) => {
                if let Ok(content) = std::str::from_utf8(&bytes) {
                    content.to_string()
                } else {
                    String::from("[Binary Content]")
                }
            }
            Err(_) => String::new(),
        }
    };

    Ok(RawFileDiffContents { original, modified })
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
        let repo = Repository::open(&path).map_err(|e| e.to_string())?;

        let commit_oid = Oid::from_str(&oid).map_err(|e| e.to_string())?;
        let commit = repo.find_commit(commit_oid).map_err(|e| e.to_string())?;
        let tree = commit.tree().map_err(|e| e.to_string())?;
        let original = get_file_content_from_tree(&repo, &tree, &file_path)?;

        let full_path = std::path::Path::new(&path).join(&file_path);
        let modified = match std::fs::read(&full_path) {
            Ok(bytes) => match std::str::from_utf8(&bytes) {
                Ok(content) => content.to_string(),
                Err(_) => String::from("[Binary Content]"),
            },
            Err(_) => String::new(),
        };

        Ok(RawFileDiffContents { original, modified })
    })
    .await
    .map_err(|e| format!("diff task failed to complete: {e}"))?
}

fn get_file_content_from_tree(
    repo: &Repository,
    tree: &git2::Tree,
    file_path: &str,
) -> Result<String, String> {
    if let Ok(entry) = tree.get_path(std::path::Path::new(file_path)) {
        if let Ok(blob) = repo.find_blob(entry.id()) {
            if blob.is_binary() {
                return Ok(String::from("[Binary Content]"));
            }
            if let Ok(content) = std::str::from_utf8(blob.content()) {
                return Ok(content.to_string());
            }
        }
    }
    Ok(String::new())
}

fn get_file_content_from_index(repo: &Repository, file_path: &str) -> Result<String, String> {
    let index = repo.index().map_err(|e| e.to_string())?;
    if let Some(entry) = index.get_path(std::path::Path::new(file_path), 0) {
        if let Ok(blob) = repo.find_blob(entry.id) {
            if blob.is_binary() {
                return Ok(String::from("[Binary Content]"));
            }
            if let Ok(content) = std::str::from_utf8(blob.content()) {
                return Ok(content.to_string());
            }
        }
    }
    Err(format!("File not found in index: {file_path}"))
}
