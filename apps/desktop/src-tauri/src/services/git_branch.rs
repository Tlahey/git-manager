use crate::error::AppError;
use crate::models::GitBranch;
use crate::utils::get_git_signature;
use git2::{Oid, Repository};
use serde::{Deserialize, Serialize};

// ─── Refs ───────────────────────────────────────────────────────────────────
//
// `ref_type` serializes as `type`, which is the name the frontend reads.

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchRef {
    pub name: String,
    pub short_name: String,
    #[serde(rename = "type")]
    pub ref_type: String,
    pub commit_oid: String,
}

/// Returns the list of branches (local and/or remote)
pub fn list_branches(repo: &Repository, include_remote: bool) -> Result<Vec<GitBranch>, AppError> {
    let branch_filter = if include_remote {
        None // all branches (local + remote)
    } else {
        Some(git2::BranchType::Local)
    };

    let mut branches: Vec<GitBranch> = Vec::new();

    for branch_result in repo.branches(branch_filter).map_err(AppError::Git)? {
        let (branch, branch_type) = branch_result.map_err(AppError::Git)?;
        let is_remote = branch_type == git2::BranchType::Remote;

        // Branch name
        let name = branch
            .name()
            .map_err(AppError::Git)?
            .unwrap_or("")
            .to_string();

        if name.is_empty() {
            continue;
        }

        // Short name (strip the remote prefix, when applicable)
        let short_name = if is_remote {
            name.split_once('/')
                .map(|(_, rest)| rest)
                .unwrap_or(&name)
                .to_string()
        } else {
            name.clone()
        };

        // OID of the branch's tip commit
        let reference = branch.get();
        let commit_oid = match reference.target() {
            Some(oid) => oid,
            None => continue, // symbolic reference with no direct target
        };
        let commit_oid_str = commit_oid.to_string();

        let commit = match repo.find_commit(commit_oid) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let commit_message = commit
            .message()
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("")
            .to_string();

        let commit_timestamp = commit.time().seconds();
        let is_head = branch.is_head();

        // Ahead / Behind vs upstream (local branches only)
        let (upstream_name, ahead_count, behind_count) = if !is_remote {
            match branch.upstream() {
                Ok(upstream_branch) => {
                    let up_name = upstream_branch.name().ok().flatten().map(|n| n.to_string());

                    let up_oid = upstream_branch.get().target();
                    if let Some(up_oid) = up_oid {
                        let (ahead, behind) = repo
                            .graph_ahead_behind(commit_oid, up_oid)
                            .unwrap_or((0, 0));
                        (up_name, ahead, behind)
                    } else {
                        (up_name, 0, 0)
                    }
                }
                Err(_) => (None, 0, 0),
            }
        } else {
            (None, 0, 0)
        };

        branches.push(GitBranch {
            name: name.clone(),
            short_name,
            is_head,
            is_remote,
            upstream: upstream_name,
            commit_oid: commit_oid_str,
            commit_message,
            commit_timestamp,
            ahead_count,
            behind_count,
        });
    }

    // Sort: HEAD first, then locals by name, then remotes
    branches.sort_by(|a, b| {
        b.is_head
            .cmp(&a.is_head)
            .then(a.is_remote.cmp(&b.is_remote))
            .then(a.short_name.cmp(&b.short_name))
    });

    Ok(branches)
}

/// Returns the list of every tag in the repository
pub fn list_tags(repo: &Repository) -> Result<Vec<BranchRef>, AppError> {
    let mut tags: Vec<BranchRef> = Vec::new();

    let tag_names = repo.tag_names(None).map_err(AppError::Git)?;

    for tag_name in tag_names.iter().flatten() {
        let full_ref_name = format!("refs/tags/{}", tag_name);
        let reference = match repo.find_reference(&full_ref_name) {
            Ok(r) => r,
            Err(_) => continue,
        };

        // Dereference annotated tags to get the commit's OID
        let commit_oid = match reference.peel_to_commit() {
            Ok(c) => c.id(),
            Err(_) => match reference.target() {
                Some(oid) => oid,
                None => continue,
            },
        };

        tags.push(BranchRef {
            name: full_ref_name,
            short_name: tag_name.to_string(),
            ref_type: "tag".to_string(),
            commit_oid: commit_oid.to_string(),
        });
    }

    // Sort by tag name DESC (most recent first)
    tags.sort_by(|a, b| b.short_name.cmp(&a.short_name));

    Ok(tags)
}

/// Returns the short name of the earliest tag whose history contains `target_oid` — i.e. the first
/// release the commit shipped in — or `None` if no tag contains it. A tag "contains" the commit
/// when the tag's commit is the target itself or a descendant of it. "Earliest" = smallest commit
/// time among containing tags, approximating `git describe --contains`.
pub fn first_tag_containing_commit(
    repo: &Repository,
    target_oid: &str,
) -> Result<Option<String>, AppError> {
    let target = Oid::from_str(target_oid)
        .map_err(|_| AppError::Unknown(format!("Invalid OID: {target_oid}")))?;

    let tag_names = repo.tag_names(None).map_err(AppError::Git)?;
    let mut best: Option<(i64, String)> = None; // (commit time, short tag name)

    for tag_name in tag_names.iter().flatten() {
        let full_ref_name = format!("refs/tags/{}", tag_name);
        let reference = match repo.find_reference(&full_ref_name) {
            Ok(r) => r,
            Err(_) => continue,
        };
        // Dereference annotated tags down to their commit.
        let commit = match reference.peel_to_commit() {
            Ok(c) => c,
            Err(_) => continue,
        };
        let tag_commit_oid = commit.id();

        let contains = tag_commit_oid == target
            || repo
                .graph_descendant_of(tag_commit_oid, target)
                .unwrap_or(false);
        if !contains {
            continue;
        }

        let time = commit.time().seconds();
        match &best {
            Some((best_time, _)) if *best_time <= time => {}
            _ => best = Some((time, tag_name.to_string())),
        }
    }

    Ok(best.map(|(_, name)| name))
}

/// Reports whether `target_oid` is part of the current branch's history, i.e. whether the commit
/// is HEAD or one of its ancestors. Used to only enable fixup on commits that are actually
/// rebasable from HEAD.
pub fn is_commit_on_current_branch(repo: &Repository, target_oid: &str) -> Result<bool, AppError> {
    let target = Oid::from_str(target_oid)
        .map_err(|_| AppError::Unknown(format!("Invalid OID: {target_oid}")))?;
    let head_oid = match repo.head().ok().and_then(|h| h.target()) {
        Some(oid) => oid,
        None => return Ok(false),
    };
    if head_oid == target {
        return Ok(true);
    }
    Ok(repo.graph_descendant_of(head_oid, target).unwrap_or(false))
}

/// Creates a new local branch pointing at `from_ref`, without checking it out.
/// `from_ref` accepts any revspec git2 can resolve (branch name, "HEAD", full OID).
pub fn create_branch(repo: &Repository, name: &str, from_ref: &str) -> Result<(), AppError> {
    let obj = repo
        .revparse_single(from_ref)
        .map_err(|_| AppError::Unknown(format!("Invalid reference: {from_ref}")))?;
    let commit = obj.peel_to_commit().map_err(AppError::Git)?;
    repo.branch(name, &commit, false).map_err(AppError::Git)?;
    Ok(())
}

/// Creates a lightweight tag pointing at `from_ref`.
pub fn create_tag_lightweight(
    repo: &Repository,
    name: &str,
    from_ref: &str,
) -> Result<(), AppError> {
    if repo.find_reference(&format!("refs/tags/{name}")).is_ok() {
        return Err(AppError::TagAlreadyExists(name.to_string()));
    }
    let obj = repo
        .revparse_single(from_ref)
        .map_err(|_| AppError::Unknown(format!("Invalid reference: {from_ref}")))?;
    repo.tag_lightweight(name, &obj, false)
        .map_err(AppError::Git)?;
    Ok(())
}

/// Creates an annotated tag (with a message and a signature) pointing at `from_ref`.
pub fn create_tag_annotated(
    repo: &Repository,
    name: &str,
    from_ref: &str,
    message: &str,
) -> Result<(), AppError> {
    if repo.find_reference(&format!("refs/tags/{name}")).is_ok() {
        return Err(AppError::TagAlreadyExists(name.to_string()));
    }
    let obj = repo
        .revparse_single(from_ref)
        .map_err(|_| AppError::Unknown(format!("Invalid reference: {from_ref}")))?;
    let sig = get_git_signature(repo)?;
    repo.tag(name, &obj, &sig, message, false)
        .map_err(AppError::Git)?;
    Ok(())
}

/// Deletes a tag (lightweight or annotated) by its short name (without the `refs/tags/` prefix).
pub fn delete_tag(repo: &Repository, name: &str) -> Result<(), AppError> {
    repo.tag_delete(name).map_err(AppError::Git)
}

/// Checks out a local branch by name, or a raw commit by OID (detached HEAD). The OID fallback
/// lets a checkout undo restore a detached HEAD.
pub fn checkout_branch(repo: &Repository, ref_name: &str, force: bool) -> Result<(), AppError> {
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    if force {
        checkout_opts.force();
    } else {
        checkout_opts.safe();
    }

    if let Ok(branch) = repo.find_branch(ref_name, git2::BranchType::Local) {
        let reference = branch.into_reference();
        let commit = reference.peel_to_commit().map_err(AppError::Git)?;
        repo.checkout_tree(commit.as_object(), Some(&mut checkout_opts))
            .map_err(AppError::Git)?;
        let ref_full_name = reference
            .name()
            .ok_or_else(|| AppError::Unknown("Invalid branch ref name".to_string()))?;
        repo.set_head(ref_full_name).map_err(AppError::Git)?;
        return Ok(());
    }

    // Not a local branch: try a raw OID (detached checkout)
    let oid = Oid::from_str(ref_name)
        .map_err(|_| AppError::Unknown(format!("Branch not found: {ref_name}")))?;
    let commit = repo.find_commit(oid).map_err(AppError::Git)?;
    repo.checkout_tree(commit.as_object(), Some(&mut checkout_opts))
        .map_err(AppError::Git)?;
    repo.set_head_detached(oid).map_err(AppError::Git)?;
    Ok(())
}

/// Deletes a local branch (and its remote-tracking branch, if requested).
/// `force = false` refuses the deletion if the branch isn't merged into HEAD (equivalent to
/// `git branch -d`); `force = true` deletes without checking (`-D`).
pub fn delete_branch(
    repo: &Repository,
    name: &str,
    force: bool,
    delete_remote: bool,
) -> Result<(), AppError> {
    let mut branch = repo
        .find_branch(name, git2::BranchType::Local)
        .map_err(AppError::Git)?;

    if !force {
        if let (Ok(head), Some(branch_oid)) = (repo.head(), branch.get().target()) {
            if let Some(head_oid) = head.target() {
                let is_merged = head_oid == branch_oid
                    || repo
                        .graph_descendant_of(head_oid, branch_oid)
                        .unwrap_or(false);
                if !is_merged {
                    return Err(AppError::Unknown(format!(
                        "Branch '{name}' is not fully merged"
                    )));
                }
            }
        }
    }

    let upstream_name = branch
        .upstream()
        .ok()
        .and_then(|u| u.name().ok().flatten().map(|n| n.to_string()));

    branch.delete().map_err(AppError::Git)?;

    if delete_remote {
        if let Some(upstream_name) = upstream_name {
            if let Ok(mut remote_branch) =
                repo.find_branch(&upstream_name, git2::BranchType::Remote)
            {
                let _ = remote_branch.delete();
            }
        }
    }

    Ok(())
}

/// Mirrors the frontend's `isMainBranchName` (`apps/desktop/src/lib/graphContextMenus.ts`): the
/// repo's protected primary branch, local `main`/`master`. Kept as its own small, hardcoded check
/// here rather than threaded through IPC, because the frontend's `protectedBranches` setting is a
/// per-repo, user-editable list that lives only in the frontend settings store and is never passed
/// to Rust — this is the one guarantee the backend can enforce on its own, independent of whatever
/// the dialog did or didn't check.
fn is_protected_branch_name(short_name: &str) -> bool {
    short_name == "main" || short_name == "master"
}

/// Renames a local branch (`git branch -m old new`). Refuses to rename `main`/`master` — see
/// `is_protected_branch_name`.
///
/// Preserves the upstream tracking link unchanged: `Branch::rename` (`git_branch_move` in
/// libgit2) renames the `branch.<old>.*` config section to `branch.<new>.*` as part of the same
/// call, carrying `remote`/`merge` over to the new name — so the branch keeps tracking the exact
/// remote-tracking branch it did before, matching `git branch -m`, which never touches the
/// remote-tracking branch itself. No extra step is needed here; see
/// `rename_branch_preserves_the_upstream_tracking_link` below for the regression test that pins
/// this down.
pub fn rename_branch(repo: &Repository, old_name: &str, new_name: &str) -> Result<(), AppError> {
    if is_protected_branch_name(old_name) {
        return Err(AppError::ProtectedBranch(old_name.to_string()));
    }

    let mut branch = repo
        .find_branch(old_name, git2::BranchType::Local)
        .map_err(AppError::Git)?;

    branch.rename(new_name, false).map_err(AppError::Git)?;

    Ok(())
}

/// Sets local branch `branch_name`'s upstream to `upstream` — the git2 equivalent of
/// `git branch --set-upstream-to=<upstream> <branch_name>`. `upstream` is a remote-tracking
/// branch's short name (e.g. `origin/main`), matching what `Branch::set_upstream` expects (see
/// `set_upstream_if_unset` in `services/git_remote.rs`, which calls the same git2 primitive
/// automatically after a first push).
///
/// Errors if the local branch doesn't exist. `Branch::set_upstream` itself does not require the
/// target ref to already exist — it only writes `branch.<name>.remote`/`.merge` config, so it
/// would happily "succeed" against a typo or a not-yet-pushed name. That is surprising for a menu
/// action the user expects to pick from what is actually there, so this checks the remote-tracking
/// branch exists first and reports `BranchNotFound` instead of silently pointing the branch at
/// nothing.
pub fn set_branch_upstream(
    repo: &Repository,
    branch_name: &str,
    upstream: &str,
) -> Result<(), AppError> {
    let mut branch = repo
        .find_branch(branch_name, git2::BranchType::Local)
        .map_err(AppError::Git)?;

    repo.find_branch(upstream, git2::BranchType::Remote)
        .map_err(|_| AppError::BranchNotFound(upstream.to_string()))?;

    branch.set_upstream(Some(upstream)).map_err(AppError::Git)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Creates a temporary repository with an initial commit (borrowed from the template used by
    /// `git_interactive_rebase.rs` — no dedicated test dependency in this workspace).
    fn init_repo_with_commit(name: &str) -> (std::path::PathBuf, Repository) {
        let dir =
            std::env::temp_dir().join(format!("gm-test-branch-{}-{}", name, std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        let sig = get_git_signature(&repo).unwrap();
        {
            // `Tree` borrows `repo` and implements `Drop`: its scope must end before `repo` is
            // moved into the return value below.
            let tree_oid = repo.index().unwrap().write_tree().unwrap();
            let tree = repo.find_tree(tree_oid).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
                .unwrap();
        }
        (dir, repo)
    }

    /// Creates a bare `refs/remotes/<name>` reference at HEAD, standing in for a fetched
    /// remote-tracking branch without needing an actual second repository + fetch.
    ///
    /// Also registers `name`'s leading path segment as an actual remote (if not already present) —
    /// `Branch::set_upstream` resolves which remote owns a `refs/remotes/...` ref by walking the
    /// repo's configured remotes, not by trusting the ref's own name, so a bare ref with no matching
    /// remote makes it fail with "could not determine remote for '...'" even though the ref exists.
    fn create_remote_ref(repo: &Repository, name: &str) {
        let head_oid = repo.head().unwrap().peel_to_commit().unwrap().id();
        repo.reference(
            &format!("refs/remotes/{name}"),
            head_oid,
            false,
            "test remote-tracking ref",
        )
        .unwrap();

        let remote_name = name.split_once('/').map(|(r, _)| r).unwrap_or(name);
        if repo.find_remote(remote_name).is_err() {
            repo.remote(remote_name, "file:///dev/null").unwrap();
        }
    }

    #[test]
    fn delete_tag_removes_lightweight_tag() {
        let (dir, repo) = init_repo_with_commit("delete-lightweight");
        create_tag_lightweight(&repo, "v1", "HEAD").unwrap();
        assert!(repo.find_reference("refs/tags/v1").is_ok());

        delete_tag(&repo, "v1").unwrap();

        assert!(repo.find_reference("refs/tags/v1").is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_tag_removes_annotated_tag() {
        let (dir, repo) = init_repo_with_commit("delete-annotated");
        create_tag_annotated(&repo, "v2", "HEAD", "release notes").unwrap();

        delete_tag(&repo, "v2").unwrap();

        assert!(repo.find_reference("refs/tags/v2").is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_tag_errors_when_tag_missing() {
        let (dir, repo) = init_repo_with_commit("delete-missing");

        assert!(delete_tag(&repo, "does-not-exist").is_err());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rename_branch_moves_the_local_ref() {
        let (dir, repo) = init_repo_with_commit("rename-success");
        create_branch(&repo, "feature-old", "HEAD").unwrap();

        rename_branch(&repo, "feature-old", "feature-new").unwrap();

        assert!(repo
            .find_branch("feature-old", git2::BranchType::Local)
            .is_err());
        assert!(repo
            .find_branch("feature-new", git2::BranchType::Local)
            .is_ok());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rename_branch_errors_when_target_name_already_exists() {
        let (dir, repo) = init_repo_with_commit("rename-conflict");
        create_branch(&repo, "feature-a", "HEAD").unwrap();
        create_branch(&repo, "feature-b", "HEAD").unwrap();

        let err = rename_branch(&repo, "feature-a", "feature-b").unwrap_err();
        assert!(matches!(err, AppError::Git(_)));
        // Both branches are still there: the rejected rename touched neither.
        assert!(repo
            .find_branch("feature-a", git2::BranchType::Local)
            .is_ok());
        assert!(repo
            .find_branch("feature-b", git2::BranchType::Local)
            .is_ok());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rename_branch_rejects_a_protected_branch() {
        let (dir, repo) = init_repo_with_commit("rename-protected");
        // `Repository::init` honours the host's `init.defaultBranch`, so force a "main" branch
        // into existence rather than relying on it being the one the commit already landed on.
        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("main", &head_commit, true).unwrap();

        let err = rename_branch(&repo, "main", "renamed-main").unwrap_err();
        assert!(matches!(err, AppError::ProtectedBranch(name) if name == "main"));
        assert!(repo.find_branch("main", git2::BranchType::Local).is_ok());
        assert!(repo
            .find_branch("renamed-main", git2::BranchType::Local)
            .is_err());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rename_branch_preserves_the_upstream_tracking_link() {
        let (dir, repo) = init_repo_with_commit("rename-upstream");
        create_branch(&repo, "feature-old", "HEAD").unwrap();

        // Fake a remote-tracking branch and point `feature-old` at it, mirroring what a real
        // `git fetch` + `push -u` sets up. `set_upstream` below resolves the remote name from the
        // remote's own fetch refspec, so a real (if unreachable) "origin" remote is required.
        repo.remote("origin", "file:///dev/null").unwrap();
        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        repo.reference(
            "refs/remotes/origin/feature-old",
            head_commit.id(),
            true,
            "test upstream",
        )
        .unwrap();
        {
            let mut branch = repo
                .find_branch("feature-old", git2::BranchType::Local)
                .unwrap();
            branch.set_upstream(Some("origin/feature-old")).unwrap();
        }

        rename_branch(&repo, "feature-old", "feature-new").unwrap();

        // The renamed branch still resolves an upstream, and it's still the same remote-tracking
        // branch as before — the rename never touched `refs/remotes/origin/feature-old`, matching
        // `git branch -m`.
        let renamed = repo
            .find_branch("feature-new", git2::BranchType::Local)
            .unwrap();
        let upstream = renamed.upstream().unwrap();
        assert_eq!(upstream.name().unwrap(), Some("origin/feature-old"));

        std::fs::remove_dir_all(&dir).ok();
    }

    // ─── set_branch_upstream ────────────────────────────────────────────────

    #[test]
    fn set_branch_upstream_points_local_branch_at_remote_tracking_branch() {
        let (dir, repo) = init_repo_with_commit("set-upstream-ok");
        create_branch(&repo, "feature", "HEAD").unwrap();
        create_remote_ref(&repo, "origin/feature");

        set_branch_upstream(&repo, "feature", "origin/feature").unwrap();

        let branch = repo
            .find_branch("feature", git2::BranchType::Local)
            .unwrap();
        let upstream = branch.upstream().unwrap();
        assert_eq!(upstream.name().unwrap().unwrap(), "origin/feature");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn set_branch_upstream_errors_when_remote_branch_missing() {
        let (dir, repo) = init_repo_with_commit("set-upstream-missing-remote");
        create_branch(&repo, "feature", "HEAD").unwrap();

        let err = set_branch_upstream(&repo, "feature", "origin/does-not-exist").unwrap_err();
        assert!(matches!(err, AppError::BranchNotFound(_)));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn set_branch_upstream_errors_when_local_branch_missing() {
        let (dir, repo) = init_repo_with_commit("set-upstream-missing-local");
        create_remote_ref(&repo, "origin/main");

        assert!(set_branch_upstream(&repo, "does-not-exist", "origin/main").is_err());

        std::fs::remove_dir_all(&dir).ok();
    }
}
