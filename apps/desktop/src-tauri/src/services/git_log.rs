use crate::error::AppError;
use crate::services::git_graph::{relocate_head_ref, HeadOverride, LogRef};
use git2::{BranchType, Oid, Repository, Sort};
use std::collections::{HashMap, HashSet};

/// Resolves a branch/reference name to a commit OID, trying (in order) a local branch, a remote
/// branch, `<remote>/<name>` for every configured remote, a generic `revparse_single`, then a tag
/// ref. Shared by the single-branch `branch` filter and the multi-branch `solo_branches` filter.
fn resolve_ref_target(repo: &Repository, name: &str) -> Option<Oid> {
    if let Ok(b) = repo.find_branch(name, BranchType::Local) {
        if let Some(oid) = b.get().target() {
            return Some(oid);
        }
    }
    if let Ok(b) = repo.find_branch(name, BranchType::Remote) {
        if let Some(oid) = b.get().target() {
            return Some(oid);
        }
    }
    if let Ok(remotes) = repo.remotes() {
        for remote in remotes.iter().flatten() {
            let full_remote_branch = format!("{}/{}", remote, name);
            if let Ok(b) = repo.find_branch(&full_remote_branch, BranchType::Remote) {
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

/// The paginated commit OIDs to render, the OIDs of every stash commit, and the oid → ref-badges
/// map (branches, tags, remotes, HEAD, stashes) — everything `git_graph::build_graph_nodes` needs
/// to lay the graph out.
#[derive(Debug)]
pub struct LogWalk {
    pub oids: Vec<Oid>,
    pub stash_oids: Vec<Oid>,
    pub refs_map: HashMap<String, Vec<LogRef>>,
}

/// Resolves which commits belong in the paginated log view and builds the ref-badge map — the
/// walk-construction half of `get_log`; `git_graph::build_graph_nodes` is the layout half.
///
/// Handles: filtering out a stash's synthetic 2nd/3rd parent (it isn't a real merge and shouldn't
/// render as one), seeding the revwalk from the soloed branches / a single branch filter / every
/// branch+remote+stash, and relabeling refs under a `head_override` preview. See `get_log`'s doc
/// comment in `commands/log.rs` for what `head_override` previews and why the fallback-HEAD push
/// is skipped under one.
#[allow(clippy::too_many_arguments)]
pub fn resolve_log_walk(
    repo: &mut Repository,
    limit: Option<usize>,
    skip: Option<usize>,
    branch: Option<&str>,
    solo_branches: Option<Vec<String>>,
    show_stashes: Option<bool>,
    hidden_stashes: Option<Vec<String>>,
    head_override: Option<&HeadOverride>,
) -> Result<LogWalk, AppError> {
    let mut stash_oids = Vec::new();
    let mut stash_refs = Vec::new();
    let _ = repo.stash_foreach(|index, _, commit_oid| {
        stash_oids.push(*commit_oid);
        stash_refs.push((index, commit_oid.to_string()));
        true
    });

    let mut ignored_stash_parent_oids = HashSet::new();
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
            if let Some(oid) = resolve_ref_target(repo, name) {
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
    } else if let Some(branch_name) = branch {
        if let Some(oid) = resolve_ref_target(repo, branch_name) {
            revwalk.push(oid).map_err(AppError::Git)?;
        } else {
            return Err(AppError::Unknown(format!(
                "Could not resolve branch/reference '{}'",
                branch_name
            )));
        }
    } else {
        // Walk every branch and remote. Under an override the local branches are pushed one by one
        // instead of by glob, so the overridden one can be skipped and its pretended tip pushed in
        // its place — `push_glob` has no way to exclude a ref.
        if let Some(over) = head_override {
            if let Ok(branches) = repo.branches(Some(BranchType::Local)) {
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
    if let Some(over) = head_override {
        relocate_head_ref(&mut refs_map, &over.branch, &over.oid);
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

    Ok(LogWalk {
        oids,
        stash_oids,
        refs_map,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-gitlog-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn commit(repo: &Repository, file: &str, content: &str, message: &str) -> Oid {
        std::fs::write(repo.workdir().unwrap().join(file), content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new(file)).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = get_git_signature(repo).unwrap();
        let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
        let parents: Vec<_> = parent.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents)
            .unwrap()
    }

    #[test]
    fn walks_head_by_default_and_resolves_branch_by_name() {
        let dir = temp_dir("default-walk");
        let mut repo = Repository::init(&dir).unwrap();
        let first = commit(&repo, "a.txt", "1", "first");
        let second = commit(&repo, "a.txt", "2", "second");

        let walk = resolve_log_walk(&mut repo, None, None, None, None, None, None, None).unwrap();
        assert!(walk.oids.contains(&first));
        assert!(walk.oids.contains(&second));
        assert!(walk.refs_map.contains_key(&second.to_string()));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_unresolvable_branch_filter_errors_instead_of_returning_an_empty_log() {
        let dir = temp_dir("bad-branch");
        let mut repo = Repository::init(&dir).unwrap();
        commit(&repo, "a.txt", "1", "first");

        let err = resolve_log_walk(
            &mut repo,
            None,
            None,
            Some("does-not-exist"),
            None,
            None,
            None,
            None,
        )
        .unwrap_err();
        assert!(matches!(err, AppError::Unknown(_)));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn pagination_limits_and_skips_the_walked_commits() {
        let dir = temp_dir("pagination");
        let mut repo = Repository::init(&dir).unwrap();
        commit(&repo, "a.txt", "1", "first");
        commit(&repo, "a.txt", "2", "second");
        commit(&repo, "a.txt", "3", "third");

        let walk =
            resolve_log_walk(&mut repo, Some(1), Some(1), None, None, None, None, None).unwrap();
        assert_eq!(walk.oids.len(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }
}
