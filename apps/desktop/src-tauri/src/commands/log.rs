use crate::error::AppError;
use crate::models::GitDiff;
use crate::services::{git_diff, git_graph};
use git2::{Oid, Repository, Sort};
use std::collections::HashMap;

pub use crate::services::git_graph::{HeadOverride, LogGraphNode, LogRef};

/// Resolves a branch/reference name to a commit OID, trying (in order) a local branch, a remote
/// branch, `<remote>/<name>` for every configured remote, a generic `revparse_single`, then a tag
/// ref. Shared by the single-branch `branch` filter and the multi-branch `solo_branches` filter.
fn resolve_ref_target(repo: &Repository, name: &str) -> Option<Oid> {
    if let Ok(b) = repo.find_branch(name, git2::BranchType::Local) {
        if let Some(oid) = b.get().target() {
            return Some(oid);
        }
    }
    if let Ok(b) = repo.find_branch(name, git2::BranchType::Remote) {
        if let Some(oid) = b.get().target() {
            return Some(oid);
        }
    }
    if let Ok(remotes) = repo.remotes() {
        for remote in remotes.iter().flatten() {
            let full_remote_branch = format!("{}/{}", remote, name);
            if let Ok(b) = repo.find_branch(&full_remote_branch, git2::BranchType::Remote) {
                if let Some(oid) = b.get().target() {
                    return Some(oid);
                }
            }
        }
    }
    if let Ok(obj) = repo.revparse_single(name) {
        return Some(obj.id());
    }
    let tag_ref = format!("refs/tags/{}", name);
    if let Ok(obj) = repo.revparse_single(&tag_ref) {
        return Some(obj.id());
    }
    None
}

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

    let mut stash_oids = Vec::new();
    let mut stash_refs = Vec::new();
    let _ = repo.stash_foreach(|index, _, commit_oid| {
        stash_oids.push(*commit_oid);
        stash_refs.push((index, commit_oid.to_string()));
        true
    });

    let mut ignored_stash_parent_oids = std::collections::HashSet::new();
    for commit_oid in &stash_oids {
        if let Ok(commit) = repo.find_commit(*commit_oid) {
            for i in 1..commit.parent_count() {
                if let Ok(parent) = commit.parent(i) {
                    ignored_stash_parent_oids.insert(parent.id());
                }
            }
        }
    }

    let mut revwalk = repo.revwalk().map_err(AppError::Git)?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(AppError::Git)?;

    // Solo mode (the graph's branch-visibility filter) takes precedence over the single-branch
    // `branch` filter: keep only the non-blank names the frontend sent.
    let solo_names: Vec<String> = solo_branches
        .into_iter()
        .flatten()
        .filter(|n| !n.trim().is_empty())
        .collect();

    if !solo_names.is_empty() {
        // Only commits reachable from the soloed branches. Skip a name that no longer resolves (a
        // soloed branch may have been deleted since it was picked) rather than failing the whole
        // log; if none resolve, fall back to HEAD so the graph isn't blank.
        let mut pushed_any = false;
        for name in &solo_names {
            if let Some(oid) = resolve_ref_target(&repo, name) {
                let _ = revwalk.push(oid);
                pushed_any = true;
            }
        }
        if !pushed_any {
            if let Ok(head) = repo.head() {
                if let Some(oid) = head.target() {
                    let _ = revwalk.push(oid);
                }
            }
        }
    } else if let Some(ref branch_name) = branch {
        if let Some(oid) = resolve_ref_target(&repo, branch_name) {
            revwalk.push(oid).map_err(AppError::Git)?;
        } else {
            return Err(format!(
                "Could not resolve branch/reference '{}'",
                branch_name
            ));
        }
    } else {
        // Walk every branch and remote. Under an override the local branches are pushed one by one
        // instead of by glob, so the overridden one can be skipped and its pretended tip pushed in
        // its place — `push_glob` has no way to exclude a ref.
        if let Some(ref over) = head_override {
            if let Ok(branches) = repo.branches(Some(git2::BranchType::Local)) {
                for (local, _) in branches.flatten() {
                    if local.name().ok().flatten() == Some(over.branch.as_str()) {
                        continue;
                    }
                    if let Some(oid) = local.get().target() {
                        let _ = revwalk.push(oid);
                    }
                }
            }
            if let Ok(oid) = Oid::from_str(&over.oid) {
                let _ = revwalk.push(oid);
            }
        } else {
            let _ = revwalk.push_glob("refs/heads/*");
        }
        let _ = revwalk.push_glob("refs/remotes/*");
        // Walk and push every stash
        if show_stashes.unwrap_or(true) {
            for oid in &stash_oids {
                let oid_str = oid.to_string();
                if let Some(ref hidden) = hidden_stashes {
                    if hidden.contains(&oid_str) {
                        continue;
                    }
                }
                let _ = revwalk.push(*oid);
            }
        }
        // Fallback HEAD — skipped under an override, where pushing the real tip would put back
        // exactly the commits the preview is meant to take away.
        if head_override.is_none() {
            if let Ok(head) = repo.head() {
                if let Some(oid) = head.target() {
                    let _ = revwalk.push(oid);
                }
            }
        }
    }

    // ── Build the refs map (oid → Vec<LogRef>) ──────────────────────────────
    let mut refs_map: HashMap<String, Vec<LogRef>> = HashMap::new();

    // HEAD – resolve through symbolic refs (normal non-detached HEAD is symbolic: HEAD → refs/heads/main → oid)
    if let Ok(head_ref) = repo.head() {
        // target() returns None for symbolic refs; peel_to_commit resolves them
        let head_oid = head_ref
            .target()
            .or_else(|| head_ref.peel_to_commit().ok().map(|c| c.id()));
        if let Some(oid) = head_oid {
            refs_map.entry(oid.to_string()).or_default().push(LogRef {
                name: "HEAD".to_string(),
                short_name: "HEAD".to_string(),
                ref_type: "HEAD".to_string(),
                commit_oid: oid.to_string(),
            });
        }
    }

    if let Ok(references) = repo.references() {
        for reference in references.flatten() {
            let target_oid = match reference.peel_to_commit() {
                Ok(c) => c.id(),
                Err(_) => match reference.target() {
                    Some(o) => o,
                    None => continue,
                },
            };

            let name = match reference.name() {
                Some(n) => n.to_string(),
                None => continue,
            };

            // Skip the remote's symbolic HEAD (e.g. `refs/remotes/origin/HEAD` → `origin/main`):
            // it's just a pointer mirroring the default branch, so it renders as a duplicate
            // "HEAD" badge on top of `origin/main`. Never show it in the graph.
            if name.starts_with("refs/remotes/") && name.ends_with("/HEAD") {
                continue;
            }

            let short_name = reference.shorthand().unwrap_or("").to_string();

            let ref_type = if reference.is_branch() {
                "branch"
            } else if reference.is_tag() {
                "tag"
            } else if reference.is_remote() {
                "remote"
            } else {
                continue;
            };

            refs_map
                .entry(target_oid.to_string())
                .or_default()
                .push(LogRef {
                    name: name.clone(),
                    short_name,
                    ref_type: ref_type.to_string(),
                    commit_oid: target_oid.to_string(),
                });
        }
    }

    // Add stash references to refs_map
    for (index, oid_str) in stash_refs {
        refs_map.entry(oid_str.clone()).or_default().push(LogRef {
            name: format!("refs/stash@{{{}}}", index),
            short_name: format!("stash@{{{}}}", index),
            ref_type: "stash".to_string(),
            commit_oid: oid_str,
        });
    }

    // Relabel last, so the move applies to the finished map rather than racing the loops above.
    if let Some(ref over) = head_override {
        git_graph::relocate_head_ref(&mut refs_map, &over.branch, &over.oid);
    }

    // ── Collect the OIDs with pagination ────────────────────────────────────
    let skip_n = skip.unwrap_or(0);
    let limit_n = limit.unwrap_or(200);

    let oids: Vec<Oid> = revwalk
        .filter_map(|r| r.ok())
        .filter(|oid| !ignored_stash_parent_oids.contains(oid))
        .skip(skip_n)
        .take(limit_n)
        .collect();

    git_graph::build_graph_nodes(
        &repo,
        &oids,
        &stash_oids,
        &refs_map,
        branch.as_deref(),
        head_has_wip.unwrap_or(false),
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
