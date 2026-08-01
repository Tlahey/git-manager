use crate::error::AppError;
use crate::services::git_hooks;
use crate::utils::{get_git_signature, short_oid};
use git2::{Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

// ─── Transfer progress ────────────────────────────────────────────────────────

/// What a transfer is doing right now.
///
/// Three phases rather than one bar, because they are genuinely different waits and a single
/// percentage that resets partway through reads as a bug. A fetch downloads objects and then
/// resolves deltas locally; a push compresses and uploads.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RemoteProgressPhase {
    /// Objects coming down the wire (fetch/pull).
    Receiving,
    /// Deltas being applied locally, after the download (fetch/pull).
    Resolving,
    /// Objects going up the wire (push).
    Writing,
}

/// How far along a transfer is.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProgress {
    pub phase: RemoteProgressPhase,
    pub completed: usize,
    /// `0` while the server has not announced a count yet — the caller renders that as an
    /// indeterminate bar rather than as 0 %.
    pub total: usize,
    /// Bytes over the wire so far. The honest measure of a wait on a slow link, where the object
    /// count can sit still for a long time on one large blob.
    pub bytes: usize,
}

/// One progress report every this often, at most.
///
/// git2's transfer callback fires per packet — hundreds of times a second on a fast link. Emitting
/// an IPC event for each would cost more than the transfer itself and would flood the frontend
/// with work it cannot use: nothing on screen can meaningfully change more than a few times a
/// second.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(120);

/// Rate limiter for the transfer callbacks. Kept separate (and taking `now`) so its behaviour is
/// testable without waiting out real time.
struct ProgressThrottle {
    last: Option<Instant>,
}

impl ProgressThrottle {
    fn new() -> Self {
        Self { last: None }
    }

    /// Whether this report should go out. The first one always does — a transfer that says nothing
    /// for its first tenth of a second looks like one that never started.
    fn should_emit(&mut self, now: Instant) -> bool {
        match self.last {
            Some(previous) if now.duration_since(previous) < PROGRESS_INTERVAL => false,
            _ => {
                self.last = Some(now);
                true
            }
        }
    }
}

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

/// Fetch from a remote (defaults to "origin"), reporting transfer progress as it goes.
///
/// `on_progress` is called at most every [`PROGRESS_INTERVAL`]; pass `|_| {}` when nothing is
/// watching. It is a plain callback rather than an `AppHandle` on purpose — this layer does no
/// Tauri, so the command above decides how (and whether) a report reaches the frontend.
pub fn fetch<F: FnMut(RemoteProgress)>(
    repo: &Repository,
    remote: Option<String>,
    prune: bool,
    mut on_progress: F,
) -> Result<FetchResult, AppError> {
    let remote_name = resolve_remote_name(repo, remote);
    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let updated_refs: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let updated_refs_clone = Arc::clone(&updated_refs);

    let mut callbacks = make_auth_callbacks();

    let mut throttle = ProgressThrottle::new();
    callbacks.transfer_progress(move |stats| {
        if !throttle.should_emit(Instant::now()) {
            return true;
        }
        // Two phases off one callback: git2 keeps reporting through the local delta resolution,
        // where the received-object counter has already stopped moving. Reporting that as
        // "receiving, stuck at 100 %" is exactly the stall a progress bar is supposed to explain.
        let downloading = stats.received_objects() < stats.total_objects();
        on_progress(if downloading {
            RemoteProgress {
                phase: RemoteProgressPhase::Receiving,
                completed: stats.received_objects(),
                total: stats.total_objects(),
                bytes: stats.received_bytes(),
            }
        } else {
            RemoteProgress {
                phase: RemoteProgressPhase::Resolving,
                completed: stats.indexed_deltas(),
                total: stats.total_deltas(),
                bytes: stats.received_bytes(),
            }
        });
        true
    });

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
pub fn pull<F: FnMut(RemoteProgress)>(
    repo: &Repository,
    remote: Option<String>,
    strategy: PullStrategy,
    on_progress: F,
) -> Result<PullResult, AppError> {
    // 1. Fetch. The only networked step, so it is the only one that reports progress — the
    //    integration that follows is local and, on any repository where it isn't instant, blocked
    //    on a conflict rather than on work.
    fetch(repo, remote.clone(), false, on_progress)?;

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

/// The all-zero oid `pre-push` expects for a ref the remote does not have yet — a new branch's
/// first push, in practice. Git's own hook contract uses this rather than omitting the ref.
const PRE_PUSH_ZERO_OID: &str = "0000000000000000000000000000000000000000";

/// The local-ref name git uses for a ref being *deleted*, which has no local side to name.
const PRE_PUSH_DELETE_REF: &str = "(delete)";

/// One ref update, in the shape git's `pre-push` contract describes on stdin:
/// `<local ref> SP <local oid> SP <remote ref> SP <remote oid>`.
///
/// A struct rather than four positional arguments because the four are easy to transpose and the
/// hook is the only thing that would notice — and it would notice by making a *wrong* decision
/// (refusing a push it should allow, or worse), not by failing loudly.
struct PrePushUpdate {
    local_ref: String,
    local_oid: String,
    remote_ref: String,
    remote_oid: String,
}

impl PrePushUpdate {
    /// A ref being created or updated. `remote_oid` is `None` for one the remote has never seen —
    /// git's contract spells that as all zeros rather than by omitting the field.
    fn update(
        local_ref: String,
        local_oid: git2::Oid,
        remote_ref: String,
        remote_oid: Option<git2::Oid>,
    ) -> Self {
        Self {
            local_ref,
            local_oid: local_oid.to_string(),
            remote_ref,
            remote_oid: oid_or_zero(remote_oid),
        }
    }

    /// A ref being deleted. Git names no local ref for this case: the hook receives the literal
    /// `(delete)` and an all-zero local oid, and the *remote* side carries what is going away.
    fn delete(remote_ref: String, remote_oid: Option<git2::Oid>) -> Self {
        Self {
            local_ref: PRE_PUSH_DELETE_REF.to_string(),
            local_oid: PRE_PUSH_ZERO_OID.to_string(),
            remote_ref,
            remote_oid: oid_or_zero(remote_oid),
        }
    }

    fn stdin_line(&self) -> String {
        format!(
            "{} {} {} {}\n",
            self.local_ref, self.local_oid, self.remote_ref, self.remote_oid
        )
    }
}

fn oid_or_zero(oid: Option<git2::Oid>) -> String {
    oid.map(|oid| oid.to_string())
        .unwrap_or_else(|| PRE_PUSH_ZERO_OID.to_string())
}

/// The oid a local ref points at, or `None` when this repository does not have it.
fn ref_oid(repo: &Repository, name: &str) -> Option<git2::Oid> {
    repo.find_reference(name).ok().and_then(|r| r.target())
}

/// What this repository last saw of a *branch* on the remote.
///
/// The remote-tracking ref rather than a fresh network round trip: that is what git itself feeds
/// the hook, and asking the remote just to fill in this field would put a network call in front of
/// a hook whose whole job may be to stop the push.
fn last_known_remote_branch_oid(
    repo: &Repository,
    remote_name: &str,
    branch_name: &str,
) -> Option<git2::Oid> {
    ref_oid(repo, &format!("refs/remotes/{remote_name}/{branch_name}"))
}

/// Runs `pre-push` for one ref update, mirroring what `git push` itself feeds the hook: the
/// remote's name and URL as positional args, and the update's line on stdin. Non-zero stops the
/// push before anything reaches the network.
///
/// One line, not several — unlike the git CLI, which can push many refs in a single invocation and
/// writes one line each, every push path in this app moves exactly one ref per call.
fn run_pre_push_hook(
    repo: &Repository,
    remote_name: &str,
    update: &PrePushUpdate,
) -> Result<(), AppError> {
    let url = repo
        .find_remote(remote_name)
        .ok()
        .and_then(|r| r.url().map(str::to_string))
        .unwrap_or_default();

    let outcome = git_hooks::run_hook_with_stdin(
        repo,
        "pre-push",
        &[remote_name, &url],
        Some(&update.stdin_line()),
    )?;
    if !outcome.success {
        return Err(AppError::HookFailed {
            name: outcome.name,
            output: outcome.output,
        });
    }
    Ok(())
}

/// Push to the remote, reporting transfer progress as it goes.
///
/// Same contract as [`fetch`]: `on_progress` is rate-limited, and `|_| {}` is a valid caller.
pub fn push<F: FnMut(RemoteProgress)>(
    repo: &Repository,
    remote: Option<String>,
    force: bool,
    skip_hooks: bool,
    mut on_progress: F,
) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    let head = repo.head().map_err(AppError::Git)?;
    let branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::Unknown("HEAD is not on a branch".to_string()))?
        .to_string();
    let local_oid = head
        .target()
        .ok_or_else(|| AppError::Unknown("HEAD has no target commit".to_string()))?;

    // Before anything reaches the network, mirroring `create_commit`'s `--no-verify` escape hatch:
    // a hook that hangs or misfires must not be able to lock the user out of pushing at all.
    if !skip_hooks {
        let local_ref = format!("refs/heads/{branch_name}");
        run_pre_push_hook(
            repo,
            &remote_name,
            &PrePushUpdate::update(
                local_ref.clone(),
                local_oid,
                local_ref,
                last_known_remote_branch_oid(repo, &remote_name, &branch_name),
            ),
        )?;
    }

    let prefix = if force { "+" } else { "" };
    let refspec = format!("{prefix}refs/heads/{branch_name}:refs/heads/{branch_name}");

    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let mut callbacks = make_auth_callbacks();
    let mut throttle = ProgressThrottle::new();
    // A push has one phase: git2 reports objects going up, and there is no local resolution step
    // on this side to distinguish.
    callbacks.push_transfer_progress(move |current, total, bytes| {
        if !throttle.should_emit(Instant::now()) {
            return;
        }
        on_progress(RemoteProgress {
            phase: RemoteProgressPhase::Writing,
            completed: current,
            total,
            bytes,
        });
    });

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
    skip_hooks: bool,
) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    // The same gate the main Push button goes through. This path used to skip it, which made
    // dragging one ref badge onto another a way around a `pre-push` hook — the hook was still
    // installed, still passing on the command line, and silently not consulted here.
    if !skip_hooks {
        let local_ref = format!("refs/heads/{source}");
        let local_oid = ref_oid(repo, &local_ref)
            .ok_or_else(|| AppError::Unknown(format!("no such local branch: {source}")))?;
        run_pre_push_hook(
            repo,
            &remote_name,
            &PrePushUpdate::update(
                local_ref,
                local_oid,
                format!("refs/heads/{target}"),
                last_known_remote_branch_oid(repo, &remote_name, target),
            ),
        )?;
    }

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

/// Deletes branch `branch_name` on `remote` (defaults to "origin") by pushing an empty-source
/// refspec (`:refs/heads/<name>`), the porcelain equivalent of `git push origin :refs/heads/<name>`.
/// Reuses the same auth callbacks as `push` to keep credentials on the Rust side.
///
/// The pre-push hook's ref name is `refs/heads/<name>` (what the ref is called on the *remote* —
/// `refs/remotes/` is a purely local tracking-ref namespace, never sent to a hook). Its oid,
/// though, is read from this repository's `refs/remotes/<remote>/<name>` — unlike a tag, a
/// branch's local ref and its remote-tracking ref are different refs that can point at different
/// commits, and the remote-tracking ref is the closest thing to "what is about to be removed"
/// without a network round trip in front of a hook whose job may be to stop the push.
pub fn delete_remote_branch(
    repo: &Repository,
    remote: Option<String>,
    branch_name: &str,
    skip_hooks: bool,
) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    if !skip_hooks {
        let remote_ref = format!("refs/heads/{branch_name}");
        let remote_oid = last_known_remote_branch_oid(repo, &remote_name, branch_name);
        run_pre_push_hook(
            repo,
            &remote_name,
            &PrePushUpdate::delete(remote_ref, remote_oid),
        )?;
    }

    let refspec = format!(":refs/heads/{branch_name}");

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
    skip_hooks: bool,
) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    // A deletion is a ref update like any other as far as the hook is concerned, and it is the one
    // most worth being able to refuse. The remote oid is taken from this repository's own copy of
    // the tag — the closest thing to "what is about to be removed" that does not cost a network
    // round trip in front of a hook whose job may be to stop the push.
    if !skip_hooks {
        let remote_ref = format!("refs/tags/{tag_name}");
        let remote_oid = ref_oid(repo, &remote_ref);
        run_pre_push_hook(
            repo,
            &remote_name,
            &PrePushUpdate::delete(remote_ref, remote_oid),
        )?;
    }

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
pub fn push_tag(
    repo: &Repository,
    remote: Option<String>,
    tag_name: &str,
    skip_hooks: bool,
) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    // Tags have no remote-tracking namespace to consult — `refs/tags/` is shared, not per-remote —
    // so the remote side is reported as all zeros: "the remote does not have this ref". That is
    // true for publishing a tag, which is what this path is for, and the alternative would be an
    // `ls-remote` round trip in front of a hook whose job may be to stop the push. A hook that
    // needs to tell a new tag from a moved one has to ask the remote itself.
    if !skip_hooks {
        let tag_ref = format!("refs/tags/{tag_name}");
        let local_oid = ref_oid(repo, &tag_ref)
            .ok_or_else(|| AppError::Unknown(format!("no such tag: {tag_name}")))?;
        run_pre_push_hook(
            repo,
            &remote_name,
            &PrePushUpdate::update(tag_ref.clone(), local_oid, tag_ref, None),
        )?;
    }

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

    // ─── ProgressThrottle ─────────────────────────────────────────────────────

    #[test]
    fn first_report_always_goes_out() {
        // A transfer that says nothing for its first tenth of a second looks like one that never
        // started, which is the worst moment to be silent.
        let mut throttle = ProgressThrottle::new();
        assert!(throttle.should_emit(Instant::now()));
    }

    #[test]
    fn reports_within_the_interval_are_dropped() {
        // The callback fires per packet — hundreds of times a second on a fast link.
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new();
        assert!(throttle.should_emit(start));
        assert!(!throttle.should_emit(start + Duration::from_millis(1)));
        assert!(!throttle.should_emit(start + PROGRESS_INTERVAL - Duration::from_millis(1)));
    }

    #[test]
    fn a_report_goes_out_once_the_interval_has_passed() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new();
        throttle.should_emit(start);
        assert!(throttle.should_emit(start + PROGRESS_INTERVAL));
    }

    #[test]
    fn the_window_restarts_from_the_report_that_went_out() {
        // Not from the last *attempt*: measuring from every dropped call would let a busy transfer
        // starve the frontend indefinitely.
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new();
        throttle.should_emit(start);
        throttle.should_emit(start + Duration::from_millis(10));
        throttle.should_emit(start + Duration::from_millis(20));
        assert!(throttle.should_emit(start + PROGRESS_INTERVAL));
    }

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

        let result = pull(&f.local, None, PullStrategy::FastForwardOnly, |_| {}).unwrap();

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

        let err = pull(&f.local, None, PullStrategy::FastForwardOnly, |_| {}).unwrap_err();

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

        let result = pull(&f.local, None, PullStrategy::FastForwardOnly, |_| {}).unwrap();

        assert!(result.fast_forwarded);
        assert_eq!(
            fs::read_to_string(f.local_dir.join("untouched.txt")).unwrap(),
            "local scratch file"
        );
    }

    #[test]
    fn reports_nothing_to_do_when_already_up_to_date() {
        let f = fixture("uptodate");
        let result = pull(&f.local, None, PullStrategy::FastForwardIfPossible, |_| {}).unwrap();
        assert!(!result.fast_forwarded);
        assert_eq!(result.commits_merged, 0);
        assert!(!result.merged && !result.rebased);
    }

    #[test]
    fn fast_forward_only_refuses_a_diverged_branch_without_touching_it() {
        let f = fixture("ffonly-diverged");
        commit(&f.origin, &f.origin_dir, "remote.txt", "remote work");
        commit(&f.local, &f.local_dir, "local.txt", "local work");

        let err = pull(&f.local, None, PullStrategy::FastForwardOnly, |_| {}).unwrap_err();

        assert!(format!("{err:?}").contains("diverged"), "got {err:?}");
        assert_eq!(head_subject(&f.local_dir), "local work");
        assert_eq!(repo_state(&f.local_dir), git2::RepositoryState::Clean);
    }

    #[test]
    fn merges_a_diverged_branch_into_a_merge_commit() {
        let f = fixture("merge");
        commit(&f.origin, &f.origin_dir, "remote.txt", "remote work");
        commit(&f.local, &f.local_dir, "local.txt", "local work");

        let result = pull(&f.local, None, PullStrategy::FastForwardIfPossible, |_| {}).unwrap();

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

        let err = pull(&f.local, None, PullStrategy::FastForwardIfPossible, |_| {}).unwrap_err();

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

        let result = pull(&f.local, None, PullStrategy::Rebase, |_| {}).unwrap();

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

        let err = pull(&f.local, None, PullStrategy::Rebase, |_| {}).unwrap_err();

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

        pull(&f.local, None, PullStrategy::Rebase, |_| {}).unwrap_err();

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

        push(&f.local, None, false, true, |_| {}).unwrap();

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

        push(&f.local, None, false, true, |_| {}).unwrap();

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

    // ─── pre-push ─────────────────────────────────────────────────────────────
    // Same behaviour libgit2 never gave any hook: `pre-push` was silently skipped for every push
    // made from this app, while the same push from a terminal ran it.

    /// Installs an executable `pre-push` hook running `script`.
    fn write_hook(repo: &Repository, name: &str, script: &str) {
        let dir = repo.path().join("hooks");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        fs::write(&path, format!("#!/bin/sh\n{script}\n")).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        }
    }

    fn remote_head(origin_dir: &Path, branch: &str) -> Option<git2::Oid> {
        fresh(origin_dir)
            .find_reference(&format!("refs/heads/{branch}"))
            .ok()
            .and_then(|r| r.target())
    }

    #[cfg(unix)]
    #[test]
    fn a_failing_pre_push_hook_stops_the_push() {
        let f = push_fixture("pre-push-fails");
        let branch = f.local.head().unwrap().shorthand().unwrap().to_string();
        commit(&f.local, &f.local_dir, "more.txt", "work");
        let before = remote_head(&f.origin_dir, &branch);
        write_hook(&f.local, "pre-push", "echo 'blocked by ci' >&2\nexit 1");

        let err = push(&f.local, None, false, false, |_| {}).unwrap_err();

        match err {
            AppError::HookFailed { name, output } => {
                assert_eq!(name, "pre-push");
                assert!(output.iter().any(|l| l.contains("blocked by ci")));
            }
            other => panic!("expected a hook failure, got {other:?}"),
        }
        assert_eq!(
            remote_head(&f.origin_dir, &branch),
            before,
            "nothing should have reached the remote"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_passing_pre_push_hook_lets_the_push_through() {
        let f = push_fixture("pre-push-passes");
        let branch = f.local.head().unwrap().shorthand().unwrap().to_string();
        let new_oid = commit(&f.local, &f.local_dir, "more.txt", "work");
        write_hook(&f.local, "pre-push", "exit 0");

        push(&f.local, None, false, false, |_| {}).unwrap();

        assert_eq!(remote_head(&f.origin_dir, &branch), Some(new_oid));
    }

    #[cfg(unix)]
    #[test]
    fn skip_hooks_is_the_no_verify_escape_hatch_for_a_push() {
        // A hook that hangs or misfires must not be able to lock the user out of pushing.
        let f = push_fixture("pre-push-skipped");
        let branch = f.local.head().unwrap().shorthand().unwrap().to_string();
        let new_oid = commit(&f.local, &f.local_dir, "more.txt", "work");
        write_hook(&f.local, "pre-push", "exit 1");

        push(&f.local, None, false, true, |_| {}).unwrap();

        assert_eq!(remote_head(&f.origin_dir, &branch), Some(new_oid));
    }

    #[cfg(unix)]
    #[test]
    fn pre_push_receives_the_ref_update_line_git_itself_would_send() {
        let f = push_fixture("pre-push-stdin");
        let branch = f.local.head().unwrap().shorthand().unwrap().to_string();
        let new_oid = commit(&f.local, &f.local_dir, "more.txt", "work");
        let remote_oid = remote_head(&f.origin_dir, &branch).unwrap();
        write_hook(
            &f.local,
            "pre-push",
            "cat > \"$(dirname \"$0\")/received-stdin\"",
        );

        push(&f.local, None, false, false, |_| {}).unwrap();

        let received = fs::read_to_string(f.local.path().join("hooks/received-stdin")).unwrap();
        assert_eq!(
            received,
            format!("refs/heads/{branch} {new_oid} refs/heads/{branch} {remote_oid}\n")
        );
    }

    #[cfg(unix)]
    #[test]
    fn pre_push_reports_the_zero_oid_for_a_branch_the_remote_has_never_seen() {
        // Git's own contract for a first push: the remote side of the line is all zeros rather
        // than omitted, since there is nothing yet to name.
        let f = push_fixture("pre-push-new-branch");
        let head_commit = f.local.head().unwrap().peel_to_commit().unwrap();
        f.local.branch("feature", &head_commit, false).unwrap();
        f.local.set_head("refs/heads/feature").unwrap();
        write_hook(
            &f.local,
            "pre-push",
            "cat > \"$(dirname \"$0\")/received-stdin\"",
        );

        push(&f.local, None, false, false, |_| {}).unwrap();

        let received = fs::read_to_string(f.local.path().join("hooks/received-stdin")).unwrap();
        assert!(
            received.ends_with(&format!("{PRE_PUSH_ZERO_OID}\n")),
            "got {received:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn pre_push_receives_the_remote_name_and_url() {
        let f = push_fixture("pre-push-args");
        commit(&f.local, &f.local_dir, "more.txt", "work");
        write_hook(
            &f.local,
            "pre-push",
            "echo \"$1 $2\" > \"$(dirname \"$0\")/received-args\"",
        );

        push(&f.local, None, false, false, |_| {}).unwrap();

        let received = fs::read_to_string(f.local.path().join("hooks/received-args")).unwrap();
        assert_eq!(
            received,
            format!("origin file://{}\n", f.origin_dir.display())
        );
    }

    #[test]
    fn a_repository_with_no_pre_push_hook_pushes_exactly_as_before() {
        let f = push_fixture("pre-push-none");
        let branch = f.local.head().unwrap().shorthand().unwrap().to_string();
        let new_oid = commit(&f.local, &f.local_dir, "more.txt", "work");

        push(&f.local, None, false, false, |_| {}).unwrap();

        assert_eq!(remote_head(&f.origin_dir, &branch), Some(new_oid));
    }

    // ─── pre-push on the other three push paths ───────────────────────────────
    // `push` was the only one that consulted the hook, so dragging a ref badge onto another,
    // publishing a tag and deleting a remote tag were three ways around a gate the user had
    // installed — still passing on the command line, silently not consulted here.

    /// A hook that records the stdin git handed it, so a test can assert the exact ref-update line.
    fn recording_hook(repo: &Repository) {
        write_hook(
            repo,
            "pre-push",
            "cat > \"$(dirname \"$0\")/received-stdin\"",
        );
    }

    fn recorded_stdin(repo: &Repository) -> String {
        fs::read_to_string(repo.path().join("hooks/received-stdin")).unwrap()
    }

    fn remote_ref_oid(origin_dir: &Path, name: &str) -> Option<git2::Oid> {
        fresh(origin_dir)
            .find_reference(name)
            .ok()
            .and_then(|r| r.target())
    }

    /// Creates a lightweight tag on HEAD and returns the oid it points at.
    fn tag_head(repo: &Repository, name: &str) -> git2::Oid {
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        repo.tag_lightweight(name, head.as_object(), false).unwrap();
        head.id()
    }

    #[cfg(unix)]
    #[test]
    fn a_failing_pre_push_hook_stops_a_ref_drag() {
        let f = push_fixture("pre-push-drag-fails");
        write_hook(&f.local, "pre-push", "echo 'no direct pushes' >&2\nexit 1");
        let source = f.local.head().unwrap().shorthand().unwrap().to_string();

        let err = push_to(&f.local, None, &source, "release", false, false).unwrap_err();

        match err {
            AppError::HookFailed { name, output } => {
                assert_eq!(name, "pre-push");
                assert!(output.iter().any(|l| l.contains("no direct pushes")));
            }
            other => panic!("expected a hook failure, got {other:?}"),
        }
        assert_eq!(
            remote_ref_oid(&f.origin_dir, "refs/heads/release"),
            None,
            "nothing should have reached the remote"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_ref_drag_reports_both_ref_names_when_they_differ() {
        // The one thing this path can express that a plain push cannot: a local ref pushed under a
        // *different* name on the remote. Both sides have to reach the hook truthfully, or a hook
        // gating "what may write to refs/heads/release" is reading the wrong name.
        let f = push_fixture("pre-push-drag-stdin");
        recording_hook(&f.local);
        let source = f.local.head().unwrap().shorthand().unwrap().to_string();
        let source_oid = f.local.head().unwrap().target().unwrap();

        push_to(&f.local, None, &source, "release", false, false).unwrap();

        assert_eq!(
            recorded_stdin(&f.local),
            format!("refs/heads/{source} {source_oid} refs/heads/release {PRE_PUSH_ZERO_OID}\n")
        );
    }

    #[cfg(unix)]
    #[test]
    fn skip_hooks_is_the_no_verify_escape_hatch_for_a_ref_drag() {
        let f = push_fixture("pre-push-drag-skipped");
        write_hook(&f.local, "pre-push", "exit 1");
        let source = f.local.head().unwrap().shorthand().unwrap().to_string();
        let source_oid = f.local.head().unwrap().target().unwrap();

        push_to(&f.local, None, &source, "release", false, true).unwrap();

        assert_eq!(
            remote_ref_oid(&f.origin_dir, "refs/heads/release"),
            Some(source_oid)
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_failing_pre_push_hook_stops_a_tag_from_being_published() {
        let f = push_fixture("pre-push-tag-fails");
        tag_head(&f.local, "v1.0.0");
        write_hook(&f.local, "pre-push", "echo 'tags are frozen' >&2\nexit 1");

        let err = push_tag(&f.local, None, "v1.0.0", false).unwrap_err();

        match err {
            AppError::HookFailed { name, output } => {
                assert_eq!(name, "pre-push");
                assert!(output.iter().any(|l| l.contains("tags are frozen")));
            }
            other => panic!("expected a hook failure, got {other:?}"),
        }
        assert_eq!(
            remote_ref_oid(&f.origin_dir, "refs/tags/v1.0.0"),
            None,
            "nothing should have reached the remote"
        );
    }

    #[cfg(unix)]
    #[test]
    fn publishing_a_tag_reports_it_as_a_tag_ref_the_remote_does_not_have() {
        let f = push_fixture("pre-push-tag-stdin");
        let tag_oid = tag_head(&f.local, "v1.0.0");
        recording_hook(&f.local);

        push_tag(&f.local, None, "v1.0.0", false).unwrap();

        // Zeros on the remote side: `refs/tags/` is a shared namespace with no per-remote tracking
        // ref to consult, so "the remote does not have this" is the honest answer without an
        // ls-remote round trip in front of the hook.
        assert_eq!(
            recorded_stdin(&f.local),
            format!("refs/tags/v1.0.0 {tag_oid} refs/tags/v1.0.0 {PRE_PUSH_ZERO_OID}\n")
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_failing_pre_push_hook_stops_a_remote_tag_deletion() {
        let f = push_fixture("pre-push-tag-delete-fails");
        let tag_oid = tag_head(&f.local, "v1.0.0");
        push_tag(&f.local, None, "v1.0.0", true).unwrap();
        write_hook(&f.local, "pre-push", "echo 'no untagging' >&2\nexit 1");

        let err = delete_remote_tag(&f.local, None, "v1.0.0", false).unwrap_err();

        match err {
            AppError::HookFailed { name, output } => {
                assert_eq!(name, "pre-push");
                assert!(output.iter().any(|l| l.contains("no untagging")));
            }
            other => panic!("expected a hook failure, got {other:?}"),
        }
        assert_eq!(
            remote_ref_oid(&f.origin_dir, "refs/tags/v1.0.0"),
            Some(tag_oid),
            "the tag should still be on the remote"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_deletion_reaches_the_hook_the_way_git_describes_one() {
        // Git's own contract for a delete: no local ref to name, so the literal `(delete)` and an
        // all-zero local oid, with the *remote* side carrying what is about to go away.
        let f = push_fixture("pre-push-tag-delete-stdin");
        let tag_oid = tag_head(&f.local, "v1.0.0");
        push_tag(&f.local, None, "v1.0.0", true).unwrap();
        recording_hook(&f.local);

        delete_remote_tag(&f.local, None, "v1.0.0", false).unwrap();

        assert_eq!(
            recorded_stdin(&f.local),
            format!("{PRE_PUSH_DELETE_REF} {PRE_PUSH_ZERO_OID} refs/tags/v1.0.0 {tag_oid}\n")
        );
        assert_eq!(remote_ref_oid(&f.origin_dir, "refs/tags/v1.0.0"), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_failing_pre_push_hook_stops_a_remote_branch_deletion() {
        let f = push_fixture("pre-push-branch-delete-fails");
        let branch = f.local.head().unwrap().shorthand().unwrap().to_string();
        let branch_oid = remote_ref_oid(&f.origin_dir, &format!("refs/heads/{branch}")).unwrap();
        write_hook(
            &f.local,
            "pre-push",
            "echo 'branch is protected' >&2\nexit 1",
        );

        let err = delete_remote_branch(&f.local, None, &branch, false).unwrap_err();

        match err {
            AppError::HookFailed { name, output } => {
                assert_eq!(name, "pre-push");
                assert!(output.iter().any(|l| l.contains("branch is protected")));
            }
            other => panic!("expected a hook failure, got {other:?}"),
        }
        assert_eq!(
            remote_ref_oid(&f.origin_dir, &format!("refs/heads/{branch}")),
            Some(branch_oid),
            "the branch should still be on the remote"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_branch_deletion_reaches_the_hook_the_way_git_describes_one() {
        // Same delete shape as a tag: no local ref to name, so the literal `(delete)` and an
        // all-zero local oid. Unlike a tag, the remote side is read from the remote-tracking ref
        // (`refs/remotes/<remote>/<branch>`), not from `refs/heads/<branch>` — a branch's local ref
        // and its remote counterpart are different refs that can point at different commits.
        let f = push_fixture("pre-push-branch-delete-stdin");
        let branch = f.local.head().unwrap().shorthand().unwrap().to_string();
        let branch_oid = remote_ref_oid(&f.origin_dir, &format!("refs/heads/{branch}")).unwrap();
        recording_hook(&f.local);

        delete_remote_branch(&f.local, None, &branch, false).unwrap();

        assert_eq!(
            recorded_stdin(&f.local),
            format!("{PRE_PUSH_DELETE_REF} {PRE_PUSH_ZERO_OID} refs/heads/{branch} {branch_oid}\n")
        );
        assert_eq!(
            remote_ref_oid(&f.origin_dir, &format!("refs/heads/{branch}")),
            None
        );
    }

    #[test]
    fn the_three_other_push_paths_are_unaffected_without_a_hook() {
        // The whole point is that a repository with no `pre-push` behaves exactly as it did before
        // any of this existed.
        let f = push_fixture("pre-push-others-none");
        let source = f.local.head().unwrap().shorthand().unwrap().to_string();
        let tag_oid = tag_head(&f.local, "v1.0.0");

        push_to(&f.local, None, &source, "release", false, false).unwrap();
        push_tag(&f.local, None, "v1.0.0", false).unwrap();

        assert!(remote_ref_oid(&f.origin_dir, "refs/heads/release").is_some());
        assert_eq!(
            remote_ref_oid(&f.origin_dir, "refs/tags/v1.0.0"),
            Some(tag_oid)
        );

        delete_remote_tag(&f.local, None, "v1.0.0", false).unwrap();
        assert_eq!(remote_ref_oid(&f.origin_dir, "refs/tags/v1.0.0"), None);
    }
}
