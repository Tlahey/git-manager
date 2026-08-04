use crate::error::AppError;
use crate::services::git_hooks;
use crate::utils::{get_git_signature, short_oid};
use git2::{Repository, RepositoryState};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscardResult {
    /// OID of an orphan blob holding the file's contents before the discard (for undo).
    /// `None` when the file wasn't on disk (e.g. already empty) or was a directory.
    pub snapshot_blob_oid: Option<String>,
    pub was_untracked: bool,
    pub was_staged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub oid: String,
    pub short_oid: String,
}

/// Stages a file (adds it to the index), or removes it from the index if it was deleted on disk.
pub fn stage_file(repo: &Repository, repo_path: &str, file_path: &str) -> Result<(), AppError> {
    let mut index = repo.index().map_err(AppError::Git)?;

    let abs_path = Path::new(repo_path).join(file_path);
    if abs_path.exists() {
        index
            .add_path(Path::new(file_path))
            .map_err(AppError::Git)?;
    } else {
        // Deleted file: drop it from the index
        index
            .remove_path(Path::new(file_path))
            .map_err(AppError::Git)?;
    }

    index.write().map_err(AppError::Git)
}

/// Unstage un fichier (retirer de l'index).
pub fn unstage_file(repo: &Repository, file_path: &str) -> Result<(), AppError> {
    match repo.head() {
        Ok(head_ref) => {
            let head_commit = head_ref.peel_to_commit().map_err(AppError::Git)?;
            let obj = head_commit.as_object();
            repo.reset_default(Some(obj), [file_path])
                .map_err(AppError::Git)
        }
        Err(_) => {
            // Fresh repo with no commits: remove straight from the index
            let mut index = repo.index().map_err(AppError::Git)?;
            index
                .remove_path(Path::new(file_path))
                .map_err(AppError::Git)?;
            index.write().map_err(AppError::Git)
        }
    }
}

/// Discards all unstaged changes to a file in the working directory.
pub fn discard_file_changes(
    repo: &Repository,
    repo_path: &str,
    file_path: &str,
) -> Result<DiscardResult, AppError> {
    // Check if the file is untracked
    let status = repo.status_file(Path::new(file_path)).ok();
    let is_untracked = status
        .map(|s| s.is_wt_new() || s.is_index_new())
        .unwrap_or(false);
    let was_staged = status
        .map(|s| {
            s.is_index_new()
                || s.is_index_modified()
                || s.is_index_deleted()
                || s.is_index_renamed()
                || s.is_index_typechange()
        })
        .unwrap_or(false);

    // Snapshot the current contents (regular files only) before touching anything, so the
    // discard can be undone faithfully.
    let full_path = Path::new(repo_path).join(file_path);
    let snapshot_blob_oid = if full_path.is_file() {
        let bytes = std::fs::read(&full_path).map_err(AppError::Io)?;
        Some(repo.blob(&bytes).map_err(AppError::Git)?.to_string())
    } else {
        None
    };

    if is_untracked {
        if full_path.exists() {
            if full_path.is_dir() {
                std::fs::remove_dir_all(&full_path).map_err(AppError::Io)?;
            } else {
                std::fs::remove_file(&full_path).map_err(AppError::Io)?;
            }
        }
        // Also remove from index if it was staged as new
        let mut index = repo.index().map_err(AppError::Git)?;
        let _ = index.remove_path(Path::new(file_path));
        let _ = index.write();
        return Ok(DiscardResult {
            snapshot_blob_oid,
            was_untracked: true,
            was_staged,
        });
    }

    // Otherwise, unstage it first if it is staged
    if let Ok(head_ref) = repo.head() {
        if let Ok(head_commit) = head_ref.peel_to_commit() {
            let obj = head_commit.as_object();
            let _ = repo.reset_default(Some(obj), [file_path]);
        }
    } else {
        let mut index = repo.index().map_err(AppError::Git)?;
        let _ = index.remove_path(Path::new(file_path));
        let _ = index.write();
    }

    // Now checkout the file to discard working directory changes
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.force();
    checkout_opts.path(file_path);

    repo.checkout_index(None, Some(&mut checkout_opts))
        .map_err(AppError::Git)?;

    Ok(DiscardResult {
        snapshot_blob_oid,
        was_untracked: false,
        was_staged,
    })
}

/// Stages every modified file.
pub fn stage_all(repo: &Repository) -> Result<(), AppError> {
    let mut index = repo.index().map_err(AppError::Git)?;

    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(AppError::Git)?;
    index.write().map_err(AppError::Git)
}

/// Unstages every file.
pub fn unstage_all(repo: &Repository) -> Result<(), AppError> {
    match repo.head() {
        Ok(head_ref) => {
            let head_commit = head_ref.peel_to_commit().map_err(AppError::Git)?;
            let head_tree = head_commit.tree().map_err(AppError::Git)?;
            let index = repo.index().map_err(AppError::Git)?;

            // Collect every staged path
            let diff = repo
                .diff_tree_to_index(Some(&head_tree), Some(&index), None)
                .map_err(AppError::Git)?;

            let paths: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
            let paths_clone = Arc::clone(&paths);

            diff.foreach(
                &mut |delta, _| {
                    let p = delta
                        .new_file()
                        .path()
                        .or_else(|| delta.old_file().path())
                        .and_then(|p| p.to_str())
                        .unwrap_or("")
                        .to_string();
                    paths_clone.lock().unwrap().push(p);
                    true
                },
                None,
                None,
                None,
            )
            .map_err(AppError::Git)?;

            let collected = paths.lock().unwrap().clone();
            if !collected.is_empty() {
                let obj = head_commit.as_object();
                repo.reset_default(Some(obj), collected.iter().map(|s| s.as_str()))
                    .map_err(AppError::Git)?;
            }
            Ok(())
        }
        Err(_) => {
            // Fresh repo with no commits: clear the index
            let mut index = repo.index().map_err(AppError::Git)?;
            index.clear().map_err(AppError::Git)?;
            index.write().map_err(AppError::Git)
        }
    }
}

/// The extra parents an interrupted merge contributes to the next commit, read from `MERGE_HEAD`.
///
/// `git merge` writes the OID(s) it is merging in, then hands control back to the user to resolve;
/// the commit that finishes the merge is the one listing them alongside HEAD. libgit2 offers no API
/// for this — `Repository::commit` takes whatever parents it is handed — so a client that does not
/// read the file produces an ordinary single-parent commit and silently loses the merge: the branch
/// looks merged, `git log --graph` shows no merge, and the second side's history is unreachable.
///
/// One OID per line; several lines for an octopus merge. Unparseable lines are skipped rather than
/// failing the commit — a malformed `MERGE_HEAD` should not make the repo uncommittable.
fn read_merge_parents(repo: &Repository) -> Vec<git2::Oid> {
    let Ok(contents) = std::fs::read_to_string(repo.path().join("MERGE_HEAD")) else {
        return Vec::new();
    };
    contents
        .lines()
        .filter_map(|line| git2::Oid::from_str(line.trim()).ok())
        .collect()
}

/// Creates a commit from the staged files (or amends an existing one). Returns the full OID
/// and the short OID.
///
/// A plain (non-amend) commit finishes an interrupted merge when there is one: it takes `MERGE_HEAD`
/// as additional parents and then clears the merge state, which is what `git commit` itself does.
/// See [`read_merge_parents`] for what skipping that would cost.
/// Runs the two hooks that gate a commit, and returns the message to actually commit.
///
/// Mirrors what `git commit` does, in the same order:
///
/// 1. `pre-commit`, with no arguments. Non-zero stops everything, and nothing is written.
/// 2. The message is written to `COMMIT_EDITMSG`, then `commit-msg` runs with that path. Non-zero
///    stops everything; a zero exit means the file — which the hook is *allowed to rewrite*, and
///    which is how `commitlint --fix` and sign-off hooks work — is the real message.
///
/// This is the part libgit2 does not do and never did, so every hook in every repository was
/// silently skipped for commits made from this app.
fn run_commit_hooks(repo: &Repository, message: &str) -> Result<String, AppError> {
    let pre_commit = git_hooks::run_hook(repo, "pre-commit", &[])?;
    if !pre_commit.success {
        return Err(AppError::HookFailed {
            name: pre_commit.name,
            output: pre_commit.output,
        });
    }

    let message_path = repo.path().join("COMMIT_EDITMSG");
    std::fs::write(&message_path, message)?;

    let commit_msg = git_hooks::run_hook(repo, "commit-msg", &[&message_path.to_string_lossy()])?;
    if !commit_msg.success {
        return Err(AppError::HookFailed {
            name: commit_msg.name,
            output: commit_msg.output,
        });
    }

    // Only re-read when a hook actually ran: writing the file above is a formality otherwise, and
    // reading it back would turn a filesystem hiccup into a lost commit message.
    if !commit_msg.ran {
        return Ok(message.to_string());
    }
    Ok(std::fs::read_to_string(&message_path).unwrap_or_else(|_| message.to_string()))
}

pub fn create_commit(
    repo: &Repository,
    message: &str,
    amend: bool,
    amend_oid: Option<&str>,
    skip_hooks: bool,
) -> Result<CommitResult, AppError> {
    // Before anything is written. `git commit --no-verify` is the escape hatch this mirrors: a
    // hook that hangs or misfires must not be able to lock the user out of committing at all.
    let message = if skip_hooks {
        message.to_string()
    } else {
        run_commit_hooks(repo, message)?
    };
    let message = message.as_str();

    let sig = get_git_signature(repo)?;

    let mut index = repo.index().map_err(AppError::Git)?;
    let tree_oid = index.write_tree().map_err(AppError::Git)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;

    let oid = if let Some(amend_oid) = amend_oid.filter(|_| amend) {
        // Amending a specific commit: build a new commit carrying the new message
        let target_oid = git2::Oid::from_str(amend_oid).map_err(AppError::Git)?;
        let target_commit = repo.find_commit(target_oid).map_err(AppError::Git)?;

        // Create a new commit with the new message and the same parents
        let parents: Vec<git2::Commit> = target_commit.parents().collect();
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        repo.commit(None, &sig, &sig, message, &tree, &parent_refs)
            .map_err(AppError::Git)?
    } else if amend {
        // Amending HEAD (existing behaviour)
        let head = repo.head().map_err(AppError::Git)?;
        let head_oid = head
            .target()
            .ok_or_else(|| AppError::Unknown("HEAD has no target".to_string()))?;
        let head_commit = repo.find_commit(head_oid).map_err(AppError::Git)?;

        head_commit
            .amend(
                Some("HEAD"),
                Some(&sig),
                Some(&sig),
                None,
                Some(message),
                Some(&tree),
            )
            .map_err(AppError::Git)?
    } else {
        let mut parents: Vec<git2::Commit> = match repo.head() {
            Ok(head_ref) => {
                let parent_oid = head_ref
                    .target()
                    .ok_or_else(|| AppError::Unknown("HEAD has no target".to_string()))?;
                vec![repo.find_commit(parent_oid).map_err(AppError::Git)?]
            }
            Err(_) => vec![], // Initial commit
        };

        // A merge left mid-flight: its other side(s) belong on this commit, or the merge is lost.
        // Unresolved conflicts never get this far — `index.write_tree()` above refuses an unmerged
        // index — so reaching here means the user resolved everything and this is the merge commit.
        let merge_parents = read_merge_parents(repo);
        for merge_oid in &merge_parents {
            parents.push(repo.find_commit(*merge_oid).map_err(AppError::Git)?);
        }

        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        let new_oid = repo
            .commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
            .map_err(AppError::Git)?;

        // Clear the merge state now that the merge commit exists — otherwise `MERGE_HEAD` survives
        // and every later commit claims the same second parent. Deliberately scoped to the `Merge`
        // state: `cleanup_state` also removes `BISECT_LOG` and the cherry-pick/revert sequencer, so
        // running it during one of those would abort an operation this commit is only a step of.
        if !merge_parents.is_empty() && repo.state() == RepositoryState::Merge {
            repo.cleanup_state().map_err(AppError::Git)?;
        }

        new_oid
    };

    // `post-commit` is purely informational — git ignores whatever it returns, and so does this.
    // The commit exists; failing it now would be reporting an error for work that succeeded.
    if !skip_hooks {
        let _ = git_hooks::run_hook(repo, "post-commit", &[]);
    }

    let full_sha = oid.to_string();
    Ok(CommitResult {
        short_oid: short_oid(&full_sha),
        oid: full_sha,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_repo(name: &str) -> (std::path::PathBuf, Repository) {
        let dir = std::env::temp_dir().join(format!("gm-commit-{name}-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    /// Commits the current index with `message`, through the function under test.
    fn commit(repo: &Repository, message: &str) -> git2::Oid {
        let result = create_commit(repo, message, false, None, true).unwrap();
        git2::Oid::from_str(&result.oid).unwrap()
    }

    /// Writes `name` into the worktree and stages it.
    fn write_and_stage(repo: &Repository, dir: &Path, name: &str, contents: &str) {
        std::fs::write(dir.join(name), contents).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(name)).unwrap();
        index.write().unwrap();
    }

    /// Installs an executable hook that exits with `code` after printing `output`.
    fn write_hook(repo: &Repository, name: &str, code: i32, output: &str) {
        let dir = repo.path().join("hooks");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\necho '{output}'\nexit {code}\n")).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
    }

    fn head_message(repo: &Repository) -> String {
        repo.head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .message()
            .unwrap()
            .to_string()
    }

    // ─── Hooks ────────────────────────────────────────────────────────────────
    // The behaviour libgit2 does not provide and this app therefore never had: every repository's
    // hooks were silently skipped for commits made here, while the same commit from a terminal ran
    // them.

    #[cfg(unix)]
    #[test]
    fn a_failing_pre_commit_hook_stops_the_commit() {
        let (dir, repo) = temp_repo("hook-pre-commit-fails");
        write_and_stage(&repo, &dir, "a.txt", "one");
        write_hook(&repo, "pre-commit", 1, "lint-staged failed");

        let err = create_commit(&repo, "nope", false, None, false).unwrap_err();

        match err {
            AppError::HookFailed { name, output } => {
                assert_eq!(name, "pre-commit");
                assert!(output.iter().any(|l| l.contains("lint-staged failed")));
            }
            other => panic!("expected a hook failure, got {other:?}"),
        }
        // And nothing was written: HEAD still has no commit at all.
        assert!(repo.head().is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_passing_pre_commit_hook_lets_the_commit_through() {
        let (dir, repo) = temp_repo("hook-pre-commit-passes");
        write_and_stage(&repo, &dir, "a.txt", "one");
        write_hook(&repo, "pre-commit", 0, "all good");

        create_commit(&repo, "first", false, None, false).unwrap();
        assert_eq!(head_message(&repo), "first");
    }

    #[cfg(unix)]
    #[test]
    fn a_failing_commit_msg_hook_stops_the_commit() {
        let (dir, repo) = temp_repo("hook-commit-msg-fails");
        write_and_stage(&repo, &dir, "a.txt", "one");
        write_hook(&repo, "commit-msg", 1, "subject too long");

        let err = create_commit(&repo, "nope", false, None, false).unwrap_err();
        assert!(matches!(err, AppError::HookFailed { .. }));
        assert!(repo.head().is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_commit_msg_hook_may_rewrite_the_message() {
        // How `commitlint --fix` and sign-off hooks work: they edit the file they were handed, and
        // git commits what is left in it.
        let (dir, repo) = temp_repo("hook-commit-msg-rewrites");
        write_and_stage(&repo, &dir, "a.txt", "one");

        let hooks = repo.path().join("hooks");
        std::fs::create_dir_all(&hooks).unwrap();
        let path = hooks.join("commit-msg");
        std::fs::write(
            &path,
            "#!/bin/sh\nprintf 'rewritten by the hook' > \"$1\"\n",
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        create_commit(&repo, "original", false, None, false).unwrap();
        assert_eq!(head_message(&repo), "rewritten by the hook");
    }

    #[cfg(unix)]
    #[test]
    fn skip_hooks_is_the_no_verify_escape_hatch() {
        // A hook that hangs or misfires must not be able to lock the user out of committing.
        let (dir, repo) = temp_repo("hook-skipped");
        write_and_stage(&repo, &dir, "a.txt", "one");
        write_hook(&repo, "pre-commit", 1, "would have failed");

        create_commit(&repo, "first", false, None, true).unwrap();
        assert_eq!(head_message(&repo), "first");
    }

    #[cfg(unix)]
    #[test]
    fn a_failing_post_commit_hook_does_not_undo_the_commit() {
        // git ignores what `post-commit` returns, and so does this: the commit exists, and
        // reporting an error for work that succeeded would be a lie.
        let (dir, repo) = temp_repo("hook-post-commit-fails");
        write_and_stage(&repo, &dir, "a.txt", "one");
        write_hook(&repo, "post-commit", 1, "notification failed");

        create_commit(&repo, "first", false, None, false).unwrap();
        assert_eq!(head_message(&repo), "first");
    }

    #[test]
    fn a_repository_with_no_hooks_commits_exactly_as_before() {
        let (dir, repo) = temp_repo("hook-none");
        write_and_stage(&repo, &dir, "a.txt", "one");

        create_commit(&repo, "first", false, None, false).unwrap();
        assert_eq!(head_message(&repo), "first");
    }

    /// The ordinary case stays exactly as it was: one parent, HEAD advanced.
    #[test]
    fn create_commit_gives_an_ordinary_commit_a_single_parent() {
        let (dir, repo) = temp_repo("plain");
        write_and_stage(&repo, &dir, "a.txt", "one");
        let first = commit(&repo, "first");
        write_and_stage(&repo, &dir, "a.txt", "two");
        let second = commit(&repo, "second");

        let commit_obj = repo.find_commit(second).unwrap();
        assert_eq!(commit_obj.parent_count(), 1);
        assert_eq!(commit_obj.parent_id(0).unwrap(), first);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// The regression this exists for: with a merge under way, the commit that finishes it must
    /// list `MERGE_HEAD` as a second parent, and the merge state must be gone afterwards — or the
    /// merge is silently flattened and every later commit inherits the same stale second parent.
    #[test]
    fn create_commit_finishes_an_interrupted_merge_and_clears_its_state() {
        let (dir, repo) = temp_repo("merge");
        write_and_stage(&repo, &dir, "a.txt", "base");
        let base = commit(&repo, "base");

        // A second line of history to merge in, built directly so no checkout is needed.
        let side = {
            let base_commit = repo.find_commit(base).unwrap();
            let mut index = repo.index().unwrap();
            index.add_path(Path::new("a.txt")).unwrap();
            let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
            let sig = get_git_signature(&repo).unwrap();
            repo.commit(None, &sig, &sig, "side", &tree, &[&base_commit])
                .unwrap()
        };
        std::fs::write(repo.path().join("MERGE_HEAD"), format!("{side}\n")).unwrap();
        assert_eq!(repo.state(), RepositoryState::Merge);

        write_and_stage(&repo, &dir, "a.txt", "resolved");
        let merge_oid = commit(&repo, "merge side");

        let merge_commit = repo.find_commit(merge_oid).unwrap();
        assert_eq!(merge_commit.parent_count(), 2);
        assert_eq!(merge_commit.parent_id(0).unwrap(), base);
        assert_eq!(merge_commit.parent_id(1).unwrap(), side);
        assert!(!repo.path().join("MERGE_HEAD").exists());

        // The next commit is an ordinary one again — the stale second parent is really gone.
        write_and_stage(&repo, &dir, "a.txt", "after");
        let after = repo.find_commit(commit(&repo, "after")).unwrap();
        assert_eq!(after.parent_count(), 1);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// Cleanup is scoped to a merge: an ordinary commit must not clear state belonging to another
    /// operation, since `cleanup_state` would also drop a bisect log or a cherry-pick sequencer.
    #[test]
    fn create_commit_leaves_other_operations_state_alone() {
        let (dir, repo) = temp_repo("bisect");
        write_and_stage(&repo, &dir, "a.txt", "one");
        commit(&repo, "first");

        let bisect_log = repo.path().join("BISECT_LOG");
        std::fs::write(&bisect_log, "git bisect start\n").unwrap();

        write_and_stage(&repo, &dir, "a.txt", "two");
        commit(&repo, "second");

        assert!(bisect_log.exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A malformed `MERGE_HEAD` yields no parents rather than an error: it must not make the
    /// repository uncommittable.
    #[test]
    fn read_merge_parents_skips_unparseable_lines() {
        let (dir, repo) = temp_repo("bad-merge-head");
        std::fs::write(repo.path().join("MERGE_HEAD"), "not-an-oid\n").unwrap();

        assert!(read_merge_parents(&repo).is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }
}
