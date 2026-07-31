use crate::error::AppError;
use crate::utils::{get_git_signature, short_oid};
use git2::{Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

// ─── Result types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub remote: String,
    pub updated_refs: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub fast_forwarded: bool,
    pub commits_merged: usize,
    pub conflicts: Vec<String>,
    /// True when a merge commit was created because the branches had diverged.
    pub merged: bool,
    /// True when the local-only commits were replayed on top of the fetched tip.
    pub rebased: bool,
}

/// How `pull` integrates the fetched commits once the branches have diverged.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum PullStrategy {
    /// Fast-forward when possible, otherwise create a merge commit. `git pull`'s default.
    #[default]
    FastForwardIfPossible,
    /// Fast-forward or refuse. Never creates or rewrites a commit — `git pull --ff-only`.
    FastForwardOnly,
    /// Replay the local-only commits on top of the fetched tip — `git pull --rebase`.
    Rebase,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
    pub push_url: Option<String>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn make_auth_callbacks<'a>() -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|_url, username_from_url, _allowed_types| {
        Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
    });
    callbacks
}

fn resolve_remote_name(repo: &Repository, remote: Option<String>) -> String {
    let name_or_url = match remote {
        Some(name) => name,
        None => return "origin".to_string(),
    };
    if let Ok(remotes) = repo.remotes() {
        for r_name in remotes.iter().flatten() {
            if let Ok(r) = repo.find_remote(r_name) {
                if r.url() == Some(&name_or_url) {
                    return r_name.to_string();
                }
            }
        }
    }
    name_or_url
}

// ─── fetch ────────────────────────────────────────────────────────────────────

/// Fetch from a remote (defaults to "origin")
pub fn fetch(
    repo: &Repository,
    remote: Option<String>,
    prune: bool,
) -> Result<FetchResult, AppError> {
    let remote_name = resolve_remote_name(repo, remote);
    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let updated_refs: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let updated_refs_clone = Arc::clone(&updated_refs);

    let mut callbacks = make_auth_callbacks();
    callbacks.update_tips(move |refname, old_oid, new_oid| {
        if old_oid != new_oid {
            let short_new = new_oid.to_string();
            let short_new = short_oid(&short_new);
            updated_refs_clone
                .lock()
                .unwrap()
                .push(format!("{refname} → {short_new}"));
        }
        true
    });

    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);
    if prune {
        fetch_opts.prune(git2::FetchPrune::On);
    }

    let refspec = format!("+refs/heads/*:refs/remotes/{remote_name}/*");
    remote_obj
        .fetch(&[refspec.as_str()], Some(&mut fetch_opts), None)
        .map_err(AppError::Git)?;

    let refs = updated_refs.lock().unwrap().clone();

    Ok(FetchResult {
        remote: remote_name,
        updated_refs: refs,
    })
}

// ─── pull ─────────────────────────────────────────────────────────────────────

/// Pull: fetch, then integrate the remote branch according to `strategy`.
///
/// A clean fast-forward behaves the same under every strategy. Once the branches have diverged the
/// strategies differ, and **neither non-fast-forward strategy ever leaves the repository in a
/// paused, conflicted state** — both undo their work and report the conflicting paths instead:
///
/// * `FastForwardOnly` refuses before touching anything.
/// * `FastForwardIfPossible` merges, and on conflict aborts the merge, matching the existing
///   `merge_branch` command — the app has no UI to drive a merge-conflict resolution, so being
///   stranded in a `MERGE_HEAD` state would be worse than a clean refusal.
/// * `Rebase` replays the local commits, and on conflict aborts the rebase. This one is not a
///   preference but a hard constraint: `git_rebase::get_rebase_state` reads the `stopped-sha` and
///   `done` files that the **git CLI** writes, and libgit2's rebase writes neither (it leaves only
///   `cmt.N`/`current`/`msgnum`/`end`). A rebase paused here would therefore be reported as
///   `in_progress` with an empty plan, and the conflict panel could neither show nor continue it.
pub fn pull(
    repo: &Repository,
    remote: Option<String>,
    strategy: PullStrategy,
) -> Result<PullResult, AppError> {
    // 1. Fetch
    fetch(repo, remote.clone(), false)?;

    let remote_name = resolve_remote_name(repo, remote);

    // 2. Current branch
    let head = repo.head().map_err(AppError::Git)?;
    if !head.is_branch() {
        return Err(AppError::Unknown("HEAD is not on a branch".to_string()));
    }
    let branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::Unknown("Could not read the branch name".to_string()))?
        .to_string();

    // 3. Remote-tracking ref
    let remote_ref_name = format!("refs/remotes/{remote_name}/{branch_name}");
    let remote_ref = match repo.find_reference(&remote_ref_name) {
        Ok(r) => r,
        Err(_) => return Ok(up_to_date()),
    };

    let remote_oid = match remote_ref.target() {
        Some(oid) => oid,
        None => return Ok(up_to_date()),
    };

    let head_oid = head
        .target()
        .ok_or_else(|| AppError::Unknown("HEAD has no target".to_string()))?;

    if head_oid == remote_oid {
        return Ok(up_to_date());
    }

    // Refuse before touching anything if a local edit collides with an incoming change — the
    // same check every strategy below would otherwise hit deep inside a `checkout_tree`/`merge`
    // call, where libgit2 only reports it as a bare "N conflict(s) prevent checkout", naming
    // neither the files nor the reason. See `dirty_paths_conflicting_with`'s doc comment.
    let conflicting = dirty_paths_conflicting_with(repo, head_oid, remote_oid)?;
    if !conflicting.is_empty() {
        return Err(AppError::Unknown(format!(
            "Your local changes to {} file(s) would be overwritten by pull: {}. Commit or stash \
             them first.",
            conflicting.len(),
            conflicting.join(", ")
        )));
    }

    // 4. Check whether a fast-forward is possible
    let merge_base = repo
        .merge_base(head_oid, remote_oid)
        .map_err(AppError::Git)?;

    if merge_base == head_oid {
        let head_ref_name = head
            .name()
            .ok_or_else(|| AppError::Unknown("HEAD ref name invalid".to_string()))?
            .to_string();
        let incoming = count_commits(repo, remote_oid, head_oid)?;

        // Check out BEFORE advancing the ref. A `safe` checkout compares the working tree against
        // HEAD, so moving HEAD first makes every incoming change look like an uncommitted local
        // edit and libgit2 quietly declines to apply it — leaving the branch advanced but the
        // files stale, which is what the fast-forward test caught.
        let remote_commit = repo.find_commit(remote_oid).map_err(AppError::Git)?;
        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.safe();
        repo.checkout_tree(remote_commit.as_object(), Some(&mut checkout_opts))
            .map_err(AppError::Git)?;

        let mut local_ref = repo.find_reference(&head_ref_name).map_err(AppError::Git)?;
        local_ref
            .set_target(remote_oid, "pull: Fast-forward")
            .map_err(AppError::Git)?;

        return Ok(PullResult {
            fast_forwarded: true,
            commits_merged: incoming,
            conflicts: vec![],
            merged: false,
            rebased: false,
        });
    }

    // The branches have diverged from here on.
    match strategy {
        PullStrategy::FastForwardOnly => Err(AppError::Unknown(format!(
            "Cannot fast-forward: {branch_name} and {remote_name}/{branch_name} have diverged. \
             Pull with a merge or a rebase instead."
        ))),
        PullStrategy::FastForwardIfPossible => {
            merge_remote(repo, remote_oid, &remote_name, &branch_name, head_oid)
        }
        PullStrategy::Rebase => rebase_onto_remote(repo, remote_oid, &remote_name, &branch_name),
    }
}

/// Nothing to integrate — no remote-tracking ref, or already level with it.
fn up_to_date() -> PullResult {
    PullResult {
        fast_forwarded: false,
        commits_merged: 0,
        conflicts: vec![],
        merged: false,
        rebased: false,
    }
}

/// Paths with uncommitted changes (staged or not, tracked or untracked) that the incoming commits
/// (`head_oid..remote_oid`) also touch — the set `checkout_tree`/`merge` would refuse over, but
/// computed ourselves because neither libgit2 error names the paths, only a bare conflict count.
/// A dirty file the incoming commits never touch is not a conflict — matching `git pull`'s own
/// behavior of only refusing over an actual collision, not any uncommitted change whatsoever.
fn dirty_paths_conflicting_with(
    repo: &Repository,
    head_oid: git2::Oid,
    remote_oid: git2::Oid,
) -> Result<Vec<String>, AppError> {
    let mut status_opts = git2::StatusOptions::new();
    status_opts.include_untracked(true);
    let statuses = repo
        .statuses(Some(&mut status_opts))
        .map_err(AppError::Git)?;
    let dirty: HashSet<String> = statuses
        .iter()
        .filter_map(|entry| entry.path().map(|p| p.to_string()))
        .collect();
    if dirty.is_empty() {
        return Ok(Vec::new());
    }

    let head_tree = repo
        .find_commit(head_oid)
        .and_then(|c| c.tree())
        .map_err(AppError::Git)?;
    let remote_tree = repo
        .find_commit(remote_oid)
        .and_then(|c| c.tree())
        .map_err(AppError::Git)?;
    let diff = repo
        .diff_tree_to_tree(Some(&head_tree), Some(&remote_tree), None)
        .map_err(AppError::Git)?;
    let incoming: HashSet<String> = diff
        .deltas()
        .filter_map(|delta| delta.new_file().path().or_else(|| delta.old_file().path()))
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    let mut conflicting: Vec<String> = dirty.intersection(&incoming).cloned().collect();
    conflicting.sort();
    Ok(conflicting)
}

/// Counts commits reachable from `from` but not from `hide`.
fn count_commits(repo: &Repository, from: git2::Oid, hide: git2::Oid) -> Result<usize, AppError> {
    let mut walk = repo.revwalk().map_err(AppError::Git)?;
    walk.push(from).map_err(AppError::Git)?;
    walk.hide(hide).map_err(AppError::Git)?;
    Ok(walk.count())
}

/// The index's conflicted paths, deduplicated and sorted for a stable error message.
fn index_conflicts(repo: &Repository) -> Result<Vec<String>, AppError> {
    let index = repo.index().map_err(AppError::Git)?;
    let mut paths: Vec<String> = index
        .conflicts()
        .map_err(AppError::Git)?
        .filter_map(|c| c.ok())
        .filter_map(|c| {
            c.our
                .or(c.their)
                .or(c.ancestor)
                .map(|e| String::from_utf8_lossy(&e.path).to_string())
        })
        .collect();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

/// Restores the working tree and index to HEAD and clears any MERGE_HEAD/rebase leftovers.
fn restore_to_head(repo: &Repository) -> Result<(), AppError> {
    let head_commit = repo
        .head()
        .and_then(|h| h.peel_to_commit())
        .map_err(AppError::Git)?;
    repo.reset(head_commit.as_object(), git2::ResetType::Hard, None)
        .map_err(AppError::Git)?;
    repo.cleanup_state().map_err(AppError::Git)?;
    Ok(())
}

/// Creates the merge commit for a diverged branch, or aborts cleanly when it conflicts.
fn merge_remote(
    repo: &Repository,
    remote_oid: git2::Oid,
    remote_name: &str,
    branch_name: &str,
    head_oid: git2::Oid,
) -> Result<PullResult, AppError> {
    let incoming = count_commits(repo, remote_oid, head_oid)?;
    let remote_ac = repo
        .find_annotated_commit(remote_oid)
        .map_err(AppError::Git)?;

    repo.merge(&[&remote_ac], None, None)
        .map_err(AppError::Git)?;

    let conflicts = index_conflicts(repo)?;
    if !conflicts.is_empty() {
        // See this module's `pull` doc comment: no UI can drive a conflicted merge, so undo it.
        restore_to_head(repo)?;
        return Err(AppError::Unknown(format!(
            "Merge conflicts in {} file(s): {}. The pull was undone — resolve them from a merge \
             you drive yourself.",
            conflicts.len(),
            conflicts.join(", ")
        )));
    }

    let mut index = repo.index().map_err(AppError::Git)?;
    let tree = repo
        .find_tree(index.write_tree().map_err(AppError::Git)?)
        .map_err(AppError::Git)?;
    let signature = get_git_signature(repo)?;
    let head_commit = repo.find_commit(head_oid).map_err(AppError::Git)?;
    let remote_commit = repo.find_commit(remote_oid).map_err(AppError::Git)?;
    let message = format!("Merge branch '{remote_name}/{branch_name}' into {branch_name}");

    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        &message,
        &tree,
        &[&head_commit, &remote_commit],
    )
    .map_err(AppError::Git)?;
    repo.cleanup_state().map_err(AppError::Git)?;

    Ok(PullResult {
        fast_forwarded: false,
        commits_merged: incoming,
        conflicts: vec![],
        merged: true,
        rebased: false,
    })
}

/// Replays the local-only commits on top of the fetched tip, or aborts cleanly when one conflicts.
fn rebase_onto_remote(
    repo: &Repository,
    remote_oid: git2::Oid,
    remote_name: &str,
    branch_name: &str,
) -> Result<PullResult, AppError> {
    let branch_ac = repo
        .reference_to_annotated_commit(&repo.head().map_err(AppError::Git)?)
        .map_err(AppError::Git)?;
    let upstream_ac = repo
        .find_annotated_commit(remote_oid)
        .map_err(AppError::Git)?;

    let mut rebase = repo
        .rebase(Some(&branch_ac), Some(&upstream_ac), None, None)
        .map_err(AppError::Git)?;
    let signature = get_git_signature(repo)?;
    let mut replayed = 0usize;

    while let Some(step) = rebase.next() {
        step.map_err(AppError::Git)?;

        let conflicts = index_conflicts(repo)?;
        if !conflicts.is_empty() {
            // Aborting is mandatory here, not a preference — see the `pull` doc comment.
            rebase.abort().map_err(AppError::Git)?;
            return Err(AppError::Unknown(format!(
                "Rebase conflicts in {} file(s): {}. {branch_name} was left untouched — rebase \
                 onto {remote_name}/{branch_name} yourself to resolve them.",
                conflicts.len(),
                conflicts.join(", ")
            )));
        }

        match rebase.commit(None, &signature, None) {
            Ok(_) => replayed += 1,
            // An empty step means the commit is already upstream; git skips it too.
            Err(e) if e.code() == git2::ErrorCode::Applied => {}
            Err(e) => {
                rebase.abort().map_err(AppError::Git)?;
                return Err(AppError::Git(e));
            }
        }
    }

    rebase.finish(Some(&signature)).map_err(AppError::Git)?;

    Ok(PullResult {
        fast_forwarded: false,
        commits_merged: replayed,
        conflicts: vec![],
        merged: false,
        rebased: true,
    })
}

// ─── push ─────────────────────────────────────────────────────────────────────

/// Push to the remote
pub fn push(repo: &Repository, remote: Option<String>, force: bool) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    let head = repo.head().map_err(AppError::Git)?;
    let branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::Unknown("HEAD is not on a branch".to_string()))?
        .to_string();

    let prefix = if force { "+" } else { "" };
    let refspec = format!("{prefix}refs/heads/{branch_name}:refs/heads/{branch_name}");

    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let callbacks = make_auth_callbacks();
    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    remote_obj
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(AppError::Git)?;

    set_upstream_if_unset(repo, &remote_name, &branch_name)?;

    Ok(())
}

/// Mirrors `git push -u` / `push.autoSetupRemote`: a branch that has just been published for the
/// first time gets `branch.<name>.remote`/`branch.<name>.merge` configured so `Branch::upstream()`
/// (read by `git_branch::list_branches` for the toolbar's ahead/behind badges) resolves right away
/// instead of staying blank until the user runs a manual `git branch --set-upstream-to`.
///
/// Only runs when no upstream is configured yet — a branch pushed again already has one, and it
/// may deliberately point at a different remote/branch than this push just targeted, which must
/// not be silently overridden.
fn set_upstream_if_unset(
    repo: &Repository,
    remote_name: &str,
    branch_name: &str,
) -> Result<(), AppError> {
    let mut branch = repo
        .find_branch(branch_name, git2::BranchType::Local)
        .map_err(AppError::Git)?;

    if branch.upstream().is_ok() {
        return Ok(());
    }

    branch
        .set_upstream(Some(&format!("{remote_name}/{branch_name}")))
        .map_err(AppError::Git)
}

/// Pushes local branch `source` to remote branch `target` on `remote` (refspec `source:target`) —
/// used by the drag-and-drop of one ref badge onto another. Reuses the same auth callbacks as
/// `push` to keep credentials on the Rust side.
pub fn push_to(
    repo: &Repository,
    remote: Option<String>,
    source: &str,
    target: &str,
    force: bool,
) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    let prefix = if force { "+" } else { "" };
    let refspec = format!("{prefix}refs/heads/{source}:refs/heads/{target}");

    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let callbacks = make_auth_callbacks();
    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    remote_obj
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(AppError::Git)?;

    Ok(())
}

/// Deletes tag `tag_name` on `remote` (defaults to "origin") by pushing an empty-source
/// refspec (`:refs/tags/<name>`), the porcelain equivalent of `git push origin :refs/tags/<name>`.
/// Reuses the same auth callbacks as `push` to keep credentials on the Rust side.
pub fn delete_remote_tag(
    repo: &Repository,
    remote: Option<String>,
    tag_name: &str,
) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    let refspec = format!(":refs/tags/{tag_name}");

    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let callbacks = make_auth_callbacks();
    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    remote_obj
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(AppError::Git)?;

    Ok(())
}

/// Publishes tag `tag_name` to `remote` (defaults to "origin") with the refspec
/// `refs/tags/<name>:refs/tags/<name>`, the porcelain equivalent of `git push origin <name>`.
///
/// Deliberately not routed through `push_to`, which hardcodes a `refs/heads/` refspec on both
/// sides and would therefore create a *branch* named after the tag on the remote. Never forced:
/// re-pointing a tag that others have already fetched is the one thing tags are supposed not to
/// do, so a rejected push should surface rather than be overwritten.
pub fn push_tag(repo: &Repository, remote: Option<String>, tag_name: &str) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    let refspec = format!("refs/tags/{tag_name}:refs/tags/{tag_name}");

    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let callbacks = make_auth_callbacks();
    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    remote_obj
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(AppError::Git)?;

    Ok(())
}

// ─── remotes CRUD ─────────────────────────────────────────────────────────────

/// Lists the remotes with their name (GitRepo.remotes only exposes the URLs)
pub fn list_remotes(repo: &Repository) -> Result<Vec<RemoteInfo>, AppError> {
    let mut remotes = Vec::new();

    let names = repo.remotes().map_err(AppError::Git)?;
    for name in names.iter().flatten() {
        if let Ok(remote) = repo.find_remote(name) {
            remotes.push(RemoteInfo {
                name: name.to_string(),
                url: remote.url().unwrap_or("").to_string(),
                push_url: remote.pushurl().map(|s| s.to_string()),
            });
        }
    }

    Ok(remotes)
}

pub fn remove_remote(repo: &Repository, name: &str) -> Result<(), AppError> {
    repo.remote_delete(name).map_err(AppError::Git)
}

pub fn add_remote(repo: &Repository, name: &str, url: &str) -> Result<(), AppError> {
    repo.remote(name, url).map_err(AppError::Git)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-pull-{}-{}-{:?}",
            name,
            std::process::id(),
            std::thread::current().id()
        ));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Commits `file` with `body` as both content and subject, on top of HEAD.
    fn commit(repo: &Repository, dir: &Path, file: &str, body: &str) -> git2::Oid {
        fs::write(dir.join(file), body).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(file)).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let sig = git2::Signature::now("T", "t@t.t").unwrap();
        let parents = repo
            .head()
            .ok()
            .and_then(|h| h.peel_to_commit().ok())
            .map(|c| vec![c])
            .unwrap_or_default();
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, body, &tree, &parent_refs)
            .unwrap()
    }

    /// An `origin` repo with one commit, plus a clone of it that tracks `origin/master`.
    struct Fixture {
        origin_dir: PathBuf,
        origin: Repository,
        local_dir: PathBuf,
        local: Repository,
    }

    fn fixture(name: &str) -> Fixture {
        let origin_dir = temp_dir(&format!("{name}-origin"));
        let origin = Repository::init(&origin_dir).unwrap();
        commit(&origin, &origin_dir, "shared.txt", "base");

        let local_dir = temp_dir(&format!("{name}-local"));
        fs::remove_dir_all(&local_dir).ok();
        let url = format!("file://{}", origin_dir.display());
        let local = git2::build::RepoBuilder::new()
            .clone(&url, &local_dir)
            .unwrap();

        Fixture {
            origin_dir,
            origin,
            local_dir,
            local,
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.origin_dir).ok();
            fs::remove_dir_all(&self.local_dir).ok();
        }
    }

    /// Assertions reopen the repository on purpose: libgit2 caches references per `Repository`
    /// handle, so the very handle that ran the pull can still hand back the pre-pull ref. Reading
    /// through a fresh handle also makes these assertions about what really landed on disk.
    fn fresh(dir: &Path) -> Repository {
        Repository::open(dir).unwrap()
    }

    fn head_subject(dir: &Path) -> String {
        fresh(dir)
            .head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .summary()
            .unwrap()
            .to_string()
    }

    fn head_oid(dir: &Path) -> git2::Oid {
        fresh(dir).head().unwrap().target().unwrap()
    }

    fn head_parents(dir: &Path) -> usize {
        fresh(dir)
            .head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .parent_count()
    }

    fn repo_state(dir: &Path) -> git2::RepositoryState {
        fresh(dir).state()
    }

    fn head_count(dir: &Path) -> usize {
        let repo = fresh(dir);
        let mut walk = repo.revwalk().unwrap();
        walk.push_head().unwrap();
        walk.count()
    }

    #[test]
    fn fast_forwards_when_the_branch_has_not_diverged() {
        let f = fixture("ff");
        commit(&f.origin, &f.origin_dir, "shared.txt", "remote work");

        let result = pull(&f.local, None, PullStrategy::FastForwardOnly).unwrap();

        assert!(result.fast_forwarded);
        assert_eq!(result.commits_merged, 1);
        assert!(!result.merged && !result.rebased);
        assert_eq!(head_subject(&f.local_dir), "remote work");
        // The working tree followed the ref, it wasn't just a pointer move.
        assert_eq!(
            fs::read_to_string(f.local_dir.join("shared.txt")).unwrap(),
            "remote work"
        );
    }

    #[test]
    fn refuses_to_pull_over_a_conflicting_uncommitted_change() {
        let f = fixture("dirty-conflict");
        commit(&f.origin, &f.origin_dir, "shared.txt", "remote work");
        // Uncommitted local edit to the same file the incoming commit touches — never staged, so
        // this also proves the check isn't limited to the index.
        fs::write(f.local_dir.join("shared.txt"), "uncommitted local edit").unwrap();
        let before = head_oid(&f.local_dir);

        let err = pull(&f.local, None, PullStrategy::FastForwardOnly).unwrap_err();

        assert!(format!("{err:?}").contains("shared.txt"), "got {err:?}");
        assert_eq!(head_oid(&f.local_dir), before, "HEAD must not move");
        assert_eq!(
            fs::read_to_string(f.local_dir.join("shared.txt")).unwrap(),
            "uncommitted local edit",
            "the uncommitted edit must survive untouched"
        );
    }

    #[test]
    fn pulls_normally_when_the_uncommitted_change_is_unrelated() {
        let f = fixture("dirty-unrelated");
        commit(&f.origin, &f.origin_dir, "shared.txt", "remote work");
        // Uncommitted edit to a file the incoming commit never touches — must not block the pull.
        fs::write(f.local_dir.join("untouched.txt"), "local scratch file").unwrap();

        let result = pull(&f.local, None, PullStrategy::FastForwardOnly).unwrap();

        assert!(result.fast_forwarded);
        assert_eq!(
            fs::read_to_string(f.local_dir.join("untouched.txt")).unwrap(),
            "local scratch file"
        );
    }

    #[test]
    fn reports_nothing_to_do_when_already_up_to_date() {
        let f = fixture("uptodate");
        let result = pull(&f.local, None, PullStrategy::FastForwardIfPossible).unwrap();
        assert!(!result.fast_forwarded);
        assert_eq!(result.commits_merged, 0);
        assert!(!result.merged && !result.rebased);
    }

    #[test]
    fn fast_forward_only_refuses_a_diverged_branch_without_touching_it() {
        let f = fixture("ffonly-diverged");
        commit(&f.origin, &f.origin_dir, "remote.txt", "remote work");
        commit(&f.local, &f.local_dir, "local.txt", "local work");

        let err = pull(&f.local, None, PullStrategy::FastForwardOnly).unwrap_err();

        assert!(format!("{err:?}").contains("diverged"), "got {err:?}");
        assert_eq!(head_subject(&f.local_dir), "local work");
        assert_eq!(repo_state(&f.local_dir), git2::RepositoryState::Clean);
    }

    #[test]
    fn merges_a_diverged_branch_into_a_merge_commit() {
        let f = fixture("merge");
        commit(&f.origin, &f.origin_dir, "remote.txt", "remote work");
        commit(&f.local, &f.local_dir, "local.txt", "local work");

        let result = pull(&f.local, None, PullStrategy::FastForwardIfPossible).unwrap();

        assert!(result.merged);
        assert!(!result.fast_forwarded && !result.rebased);
        assert_eq!(head_parents(&f.local_dir), 2, "expected a merge commit");
        // Both sides' files are present, and the merge state was cleaned up.
        assert!(f.local_dir.join("local.txt").exists());
        assert!(f.local_dir.join("remote.txt").exists());
        assert_eq!(repo_state(&f.local_dir), git2::RepositoryState::Clean);
    }

    #[test]
    fn merge_aborts_and_restores_the_branch_when_it_conflicts() {
        let f = fixture("merge-conflict");
        commit(&f.origin, &f.origin_dir, "shared.txt", "remote edit");
        commit(&f.local, &f.local_dir, "shared.txt", "local edit");
        let before = head_oid(&f.local_dir);

        let err = pull(&f.local, None, PullStrategy::FastForwardIfPossible).unwrap_err();

        assert!(format!("{err:?}").contains("shared.txt"), "got {err:?}");
        assert_eq!(head_oid(&f.local_dir), before);
        assert_eq!(repo_state(&f.local_dir), git2::RepositoryState::Clean);
        assert_eq!(
            fs::read_to_string(f.local_dir.join("shared.txt")).unwrap(),
            "local edit"
        );
    }

    #[test]
    fn rebase_replays_local_commits_on_top_of_the_remote_tip() {
        let f = fixture("rebase");
        commit(&f.origin, &f.origin_dir, "remote.txt", "remote work");
        commit(&f.local, &f.local_dir, "local.txt", "local work");

        let result = pull(&f.local, None, PullStrategy::Rebase).unwrap();

        assert!(result.rebased);
        assert!(!result.merged && !result.fast_forwarded);
        assert_eq!(result.commits_merged, 1);
        // Linear history: the local commit sits on top, with no merge commit.
        let replayed = fresh(&f.local_dir);
        let head = replayed.head().unwrap().peel_to_commit().unwrap();
        assert_eq!(head.summary().unwrap(), "local work");
        assert_eq!(head.parent_count(), 1);
        assert_eq!(head.parent(0).unwrap().summary().unwrap(), "remote work");
        assert_eq!(head_count(&f.local_dir), 3);
        assert_eq!(repo_state(&f.local_dir), git2::RepositoryState::Clean);
    }

    #[test]
    fn rebase_aborts_and_restores_the_branch_when_it_conflicts() {
        let f = fixture("rebase-conflict");
        commit(&f.origin, &f.origin_dir, "shared.txt", "remote edit");
        commit(&f.local, &f.local_dir, "shared.txt", "local edit");
        let before = head_oid(&f.local_dir);

        let err = pull(&f.local, None, PullStrategy::Rebase).unwrap_err();

        assert!(format!("{err:?}").contains("shared.txt"), "got {err:?}");
        assert_eq!(head_oid(&f.local_dir), before);
        assert_eq!(
            fs::read_to_string(f.local_dir.join("shared.txt")).unwrap(),
            "local edit"
        );
    }

    /// Regression guard for the reason `rebase_onto_remote` aborts instead of pausing: libgit2's
    /// rebase writes neither `stopped-sha` nor `done`, so `git_rebase::get_rebase_state` would
    /// report a paused rebase as `in_progress` with an empty plan and the conflict panel could
    /// neither display nor continue it. Leaving no rebase state at all is the only safe outcome.
    #[test]
    fn rebase_conflict_leaves_no_rebase_state_behind() {
        let f = fixture("rebase-no-state");
        commit(&f.origin, &f.origin_dir, "shared.txt", "remote edit");
        commit(&f.local, &f.local_dir, "shared.txt", "local edit");

        pull(&f.local, None, PullStrategy::Rebase).unwrap_err();

        assert_eq!(repo_state(&f.local_dir), git2::RepositoryState::Clean);
        assert!(!f.local.path().join("rebase-merge").exists());
        assert!(!f.local.path().join("rebase-apply").exists());
        assert_eq!(
            crate::services::git_rebase::get_rebase_state(&fresh(&f.local_dir))
                .unwrap()
                .kind,
            "idle"
        );
    }

    #[test]
    fn pull_strategy_serializes_to_the_kebab_case_the_frontend_sends() {
        assert_eq!(
            serde_json::to_string(&PullStrategy::FastForwardIfPossible).unwrap(),
            "\"fast-forward-if-possible\""
        );
        assert_eq!(
            serde_json::to_string(&PullStrategy::FastForwardOnly).unwrap(),
            "\"fast-forward-only\""
        );
        assert_eq!(
            serde_json::to_string(&PullStrategy::Rebase).unwrap(),
            "\"rebase\""
        );
        assert_eq!(PullStrategy::default(), PullStrategy::FastForwardIfPossible);
    }

    /// A clone of a *bare* origin. Push tests can't reuse `fixture()`'s origin: libgit2's local
    /// transport refuses to push into a non-bare repository ("local push doesn't (yet) support
    /// pushing to non-bare repos"), matching real git's `receive.denyCurrentBranch` guard — see
    /// `tools/git-fixtures/scenarios/remote-ahead.sh` for the same constraint on the shell side.
    struct PushFixture {
        origin_dir: PathBuf,
        local_dir: PathBuf,
        local: Repository,
    }

    impl Drop for PushFixture {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.origin_dir).ok();
            fs::remove_dir_all(&self.local_dir).ok();
        }
    }

    fn push_ref(repo: &Repository, remote_name: &str, refspec: &str) {
        let mut remote = repo.find_remote(remote_name).unwrap();
        let callbacks = make_auth_callbacks();
        let mut push_opts = PushOptions::new();
        push_opts.remote_callbacks(callbacks);
        remote.push(&[refspec], Some(&mut push_opts)).unwrap();
    }

    fn push_fixture(name: &str) -> PushFixture {
        let origin_dir = temp_dir(&format!("{name}-origin"));
        Repository::init_bare(&origin_dir).unwrap();

        let scratch_dir = temp_dir(&format!("{name}-scratch"));
        let scratch = Repository::init(&scratch_dir).unwrap();
        commit(&scratch, &scratch_dir, "shared.txt", "base");
        let branch_name = scratch.head().unwrap().shorthand().unwrap().to_string();

        scratch
            .remote("origin", &format!("file://{}", origin_dir.display()))
            .unwrap();
        push_ref(
            &scratch,
            "origin",
            &format!("refs/heads/{branch_name}:refs/heads/{branch_name}"),
        );
        fs::remove_dir_all(&scratch_dir).ok();

        let local_dir = temp_dir(&format!("{name}-local"));
        let url = format!("file://{}", origin_dir.display());
        let local = git2::build::RepoBuilder::new()
            .clone(&url, &local_dir)
            .unwrap();

        PushFixture {
            origin_dir,
            local_dir,
            local,
        }
    }

    #[test]
    fn push_sets_upstream_for_a_brand_new_branch() {
        let f = push_fixture("push-new-branch");
        let head_commit = f.local.head().unwrap().peel_to_commit().unwrap();
        f.local.branch("feature", &head_commit, false).unwrap();
        f.local.set_head("refs/heads/feature").unwrap();

        push(&f.local, None, false).unwrap();

        let local_reopened = fresh(&f.local_dir);
        let branch = local_reopened
            .find_branch("feature", git2::BranchType::Local)
            .unwrap();
        let upstream = branch.upstream().unwrap();
        assert_eq!(upstream.name().unwrap().unwrap(), "origin/feature");
        assert!(
            fresh(&f.origin_dir)
                .find_reference("refs/heads/feature")
                .is_ok(),
            "the branch should have been pushed to the remote too"
        );
    }

    #[test]
    fn push_does_not_touch_an_already_configured_upstream() {
        let f = push_fixture("push-existing-upstream");
        let initial_branch = f.local.head().unwrap().shorthand().unwrap().to_string();
        let head_commit = f.local.head().unwrap().peel_to_commit().unwrap();

        f.local.branch("feature", &head_commit, false).unwrap();
        f.local.set_head("refs/heads/feature").unwrap();

        // Deliberately pointed at a different remote-tracking ref than this push targets, as if
        // the user had run `git branch --set-upstream-to` themselves.
        let mut branch = f
            .local
            .find_branch("feature", git2::BranchType::Local)
            .unwrap();
        branch
            .set_upstream(Some(&format!("origin/{initial_branch}")))
            .unwrap();

        push(&f.local, None, false).unwrap();

        let local_reopened = fresh(&f.local_dir);
        let branch = local_reopened
            .find_branch("feature", git2::BranchType::Local)
            .unwrap();
        let upstream = branch.upstream().unwrap();
        assert_eq!(
            upstream.name().unwrap().unwrap(),
            format!("origin/{initial_branch}"),
            "an existing upstream must not be silently overridden"
        );
        assert!(
            fresh(&f.origin_dir)
                .find_reference("refs/heads/feature")
                .is_ok(),
            "the push itself must still have gone through"
        );
    }
}
