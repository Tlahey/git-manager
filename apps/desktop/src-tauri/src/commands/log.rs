use crate::error::AppError;
use crate::models::GitDiff;
use crate::services::{git_diff, git_graph, git_log};
use git2::{Oid, Repository};

pub use crate::services::git_graph::{HeadOverride, LogGraphNode};

// ─── Tauri commands ─────────────────────────────────────────────────────────

/// Returns the paginated history as graph nodes.
///
/// `head_has_wip` — whether the frontend will render a synthetic WIP / paused-rebase row above
/// the graph, anchored on HEAD. It is an input of the column layout (see `build_graph_nodes`):
/// when true, the lane running down to HEAD's tip is seeded at column 0 because that synthetic
/// row is the graph's true first element; when false, columns follow pure top-to-bottom order.
///
/// `head_override` — render the graph *as if* one branch pointed elsewhere, for the undo/redo
/// timeline's read-only preview (see `HeadOverride`). Nothing is written; only this walk's seeds
/// and ref labels change, so the previewed graph comes out of the same layout code as the real one
/// rather than being reconstructed by the frontend.
///
/// Runs on a blocking-pool thread: the revwalk plus full-refs scan below scales with history
/// length and branch/tag count, so on a large or long-lived repo it can take long enough to stall
/// other IPC if left on this command's own async task (see `fetch_remote`'s doc comment for why
/// that matters).
#[tauri::command]
// A Tauri command surface: each field is a distinct named `invoke` argument, so grouping them
// into a struct would only obscure the wire contract.
#[allow(clippy::too_many_arguments)]
pub async fn get_log(
    path: String,
    limit: Option<usize>,
    skip: Option<usize>,
    branch: Option<String>,
    solo_branches: Option<Vec<String>>,
    show_stashes: Option<bool>,
    hidden_stashes: Option<Vec<String>>,
    head_has_wip: Option<bool>,
    head_override: Option<HeadOverride>,
) -> Result<Vec<LogGraphNode>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<LogGraphNode>, String> {
        get_log_blocking(
            path,
            limit,
            skip,
            branch,
            solo_branches,
            show_stashes,
            hidden_stashes,
            head_has_wip,
            head_override,
        )
    })
    .await
    .map_err(|e| format!("log task failed to complete: {e}"))?
}

#[allow(clippy::too_many_arguments)]
fn get_log_blocking(
    path: String,
    limit: Option<usize>,
    skip: Option<usize>,
    branch: Option<String>,
    solo_branches: Option<Vec<String>>,
    show_stashes: Option<bool>,
    hidden_stashes: Option<Vec<String>>,
    head_has_wip: Option<bool>,
    head_override: Option<HeadOverride>,
) -> Result<Vec<LogGraphNode>, String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;

    let walk = git_log::resolve_log_walk(
        &mut repo,
        limit,
        skip,
        branch.as_deref(),
        solo_branches,
        show_stashes,
        hidden_stashes,
        head_override.as_ref(),
    )
    .map_err(Into::<String>::into)?;

    git_graph::build_graph_nodes(
        &repo,
        &walk.oids,
        &walk.stash_oids,
        &walk.refs_map,
        branch.as_deref(),
        head_has_wip.unwrap_or(false),
        head_override.as_ref(),
    )
    .map_err(Into::into)
}

/// Returns the merged diff spanning a multi-commit selection — the cumulative change set from
/// just before the oldest selected commit (`base_oid`) up to the newest (`head_oid`). Used by the
/// graph's right-hand panel when more than one commit is selected. See
/// `git_diff::merged_commits_diff` for the exact `base_oid^..head_oid` semantics.
///
/// Runs on a blocking-pool thread — the diff scales with the size of the selected range.
#[tauri::command]
pub async fn get_commits_merged_diff(
    path: String,
    base_oid: String,
    head_oid: String,
) -> Result<GitDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_diff::merged_commits_diff(&repo, &base_oid, &head_oid)
    })
    .await
    .map_err(|e| format!("diff task failed to complete: {e}"))?
    .map_err(Into::into)
}

/// Returns the full diff of a commit vs. one of its parents — the first one unless `parent_index`
/// (0-based) names another, which only a merge commit has. See `git_diff::commit_diff`.
///
/// Runs on a blocking-pool thread — the diff scales with the size of the commit's change.
#[tauri::command]
pub async fn get_commit_diff(
    path: String,
    oid: String,
    parent_index: Option<u32>,
) -> Result<GitDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut repo = Repository::open(&path).map_err(AppError::Git)?;
        git_diff::commit_diff(&mut repo, &oid, parent_index)
    })
    .await
    .map_err(|e| format!("diff task failed to complete: {e}"))?
    .map_err(Into::into)
}

/// Diffs a commit's tree against the current working directory (not the index).
///
/// Runs on a blocking-pool thread — scales with the size of the working tree's own changes.
#[tauri::command]
pub async fn compare_commit_to_workdir(path: String, oid: String) -> Result<GitDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_diff::diff_commit_to_workdir(&repo, &oid)
    })
    .await
    .map_err(|e| format!("diff task failed to complete: {e}"))?
    .map_err(Into::into)
}

/// Diffs two arbitrary refs against each other (branch vs branch, but also tags or SHAs) — the
/// "compare two branches" view. See `git_diff::diff_refs` for why this is the direct two-dot diff
/// and not a merge-base one.
///
/// Runs on a blocking-pool thread — the diff scales with how far apart the two refs have drifted.
#[tauri::command]
pub async fn compare_refs(
    path: String,
    base_ref: String,
    head_ref: String,
) -> Result<GitDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        git_diff::diff_refs(&repo, &base_ref, &head_ref)
    })
    .await
    .map_err(|e| format!("diff task failed to complete: {e}"))?
    .map_err(Into::into)
}

/// Returns a file's raw content at a given commit
#[tauri::command]
pub async fn get_commit_file(
    path: String,
    oid: String,
    file_path: String,
) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let commit_oid = Oid::from_str(&oid).map_err(AppError::Git)?;
    let commit = repo.find_commit(commit_oid).map_err(AppError::Git)?;
    let tree = commit.tree().map_err(AppError::Git)?;

    let entry = tree
        .get_path(std::path::Path::new(&file_path))
        .map_err(AppError::Git)?;

    let blob = repo.find_blob(entry.id()).map_err(AppError::Git)?;

    let content = std::str::from_utf8(blob.content())
        .map_err(|_| AppError::Unknown("File content is not valid UTF-8".to_string()))?
        .to_string();

    Ok(content)
}
