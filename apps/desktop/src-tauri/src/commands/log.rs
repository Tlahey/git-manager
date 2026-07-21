use crate::error::AppError;
use crate::models::{GitDiff, GitDiffFile};
use crate::services::{git_diff, git_graph};
use git2::{DiffOptions, Oid, Repository, Sort};
use std::cell::RefCell;
use std::collections::HashMap;

pub use crate::services::git_graph::{LogGraphNode, LogRef};

// ─── Commandes Tauri ──────────────────────────────────────────────────────────

/// Retourne l'historique paginé sous forme de nœuds de graphe
#[tauri::command]
pub async fn get_log(
    path: String,
    limit: Option<usize>,
    skip: Option<usize>,
    branch: Option<String>,
    show_stashes: Option<bool>,
    hidden_stashes: Option<Vec<String>>,
) -> Result<Vec<LogGraphNode>, String> {
    let mut repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;

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

    let mut revwalk = repo.revwalk().map_err(|e| AppError::Git(e))?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(|e| AppError::Git(e))?;

    if let Some(ref branch_name) = branch {
        let mut target = None;
        if let Ok(b) = repo.find_branch(branch_name, git2::BranchType::Local) {
            target = b.get().target();
        }
        if target.is_none() {
            if let Ok(b) = repo.find_branch(branch_name, git2::BranchType::Remote) {
                target = b.get().target();
            }
        }
        if target.is_none() {
            if let Ok(remotes) = repo.remotes() {
                for remote in remotes.iter().flatten() {
                    let full_remote_branch = format!("{}/{}", remote, branch_name);
                    if let Ok(b) = repo.find_branch(&full_remote_branch, git2::BranchType::Remote) {
                        target = b.get().target();
                        break;
                    }
                }
            }
        }
        if target.is_none() {
            if let Ok(obj) = repo.revparse_single(branch_name) {
                target = Some(obj.id());
            }
        }
        if target.is_none() {
            let tag_ref = format!("refs/tags/{}", branch_name);
            if let Ok(obj) = repo.revparse_single(&tag_ref) {
                target = Some(obj.id());
            }
        }

        if let Some(oid) = target {
            revwalk.push(oid).map_err(|e| AppError::Git(e))?;
        } else {
            return Err(format!(
                "Could not resolve branch/reference '{}'",
                branch_name
            ));
        }
    } else {
        // Parcourir toutes les branches et remotes
        let _ = revwalk.push_glob("refs/heads/*");
        let _ = revwalk.push_glob("refs/remotes/*");
        // Parcourir et pousser tous les stashes
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
        // Fallback HEAD
        if let Ok(head) = repo.head() {
            if let Some(oid) = head.target() {
                let _ = revwalk.push(oid);
            }
        }
    }

    // ── Construction de la map refs (oid → Vec<LogRef>) ──────────────────────
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

    // ── Collecte des OIDs avec pagination ────────────────────────────────────
    let skip_n = skip.unwrap_or(0);
    let limit_n = limit.unwrap_or(200);

    let oids: Vec<Oid> = revwalk
        .filter_map(|r| r.ok())
        .filter(|oid| !ignored_stash_parent_oids.contains(oid))
        .skip(skip_n)
        .take(limit_n)
        .collect();

    git_graph::build_graph_nodes(&repo, &oids, &stash_oids, &refs_map, branch.as_deref())
        .map_err(Into::into)
}

/// Returns the merged diff spanning a multi-commit selection — the cumulative change set from
/// just before the oldest selected commit (`base_oid`) up to the newest (`head_oid`). Used by the
/// graph's right-hand panel when more than one commit is selected. See
/// `git_diff::merged_commits_diff` for the exact `base_oid^..head_oid` semantics.
#[tauri::command]
pub async fn get_commits_merged_diff(
    path: String,
    base_oid: String,
    head_oid: String,
) -> Result<GitDiff, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_diff::merged_commits_diff(&repo, &base_oid, &head_oid).map_err(Into::into)
}

/// Retourne le diff complet d'un commit vs son premier parent
#[tauri::command]
pub async fn get_commit_diff(path: String, oid: String) -> Result<GitDiff, String> {
    let mut repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let commit_oid = Oid::from_str(&oid).map_err(|e| AppError::Git(e))?;

    // Check if the commit is a stash commit
    let mut is_stash = false;
    let _ = repo.stash_foreach(|_index, _message, stash_oid| {
        if *stash_oid == commit_oid {
            is_stash = true;
            false
        } else {
            true
        }
    });

    let commit = repo.find_commit(commit_oid).map_err(|e| AppError::Git(e))?;

    let commit_tree = commit.tree().map_err(|e| AppError::Git(e))?;
    let parent_tree = if commit.parent_count() > 0 {
        let parent = commit.parent(0).map_err(|e| AppError::Git(e))?;
        Some(parent.tree().map_err(|e| AppError::Git(e))?)
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
        .map_err(|e| AppError::Git(e))?;

    let files: RefCell<Vec<GitDiffFile>> = RefCell::new(Vec::new());

    git_diff::diff_foreach_files(&diff, &files, false).map_err(|e| AppError::Git(e).to_string())?;

    if is_stash && commit.parent_count() == 3 {
        if let Ok(untracked_parent) = commit.parent(2) {
            if let Ok(untracked_tree) = untracked_parent.tree() {
                if let Ok(untracked_diff) =
                    repo.diff_tree_to_tree(None, Some(&untracked_tree), Some(&mut diff_opts))
                {
                    let _ = git_diff::diff_foreach_files(&untracked_diff, &files, true);
                }
            }
        }
    }

    Ok(git_diff::finalize(files.into_inner()))
}

/// Diffe l'arbre d'un commit contre le working directory actuel (pas l'index).
#[tauri::command]
pub async fn compare_commit_to_workdir(path: String, oid: String) -> Result<GitDiff, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_diff::diff_commit_to_workdir(&repo, &oid).map_err(Into::into)
}

/// Retourne le contenu brut d'un fichier à un commit donné
#[tauri::command]
pub async fn get_commit_file(
    path: String,
    oid: String,
    file_path: String,
) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let commit_oid = Oid::from_str(&oid).map_err(|e| AppError::Git(e))?;
    let commit = repo.find_commit(commit_oid).map_err(|e| AppError::Git(e))?;
    let tree = commit.tree().map_err(|e| AppError::Git(e))?;

    let entry = tree
        .get_path(std::path::Path::new(&file_path))
        .map_err(|e| AppError::Git(e))?;

    let blob = repo.find_blob(entry.id()).map_err(|e| AppError::Git(e))?;

    let content = std::str::from_utf8(blob.content())
        .map_err(|_| AppError::Unknown("File content is not valid UTF-8".to_string()))?
        .to_string();

    Ok(content)
}
