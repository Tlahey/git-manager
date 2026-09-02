use crate::error::AppError;
use crate::models::GitStash;
use crate::utils::get_git_signature;
use git2::{Oid, Repository, Signature, StashFlags};

/// Creates a git stash
pub fn stash_push(
    repo: &mut Repository,
    message: Option<&str>,
    include_untracked: bool,
) -> Result<(), String> {
    let sig = get_git_signature(repo)?;

    let mut flags = StashFlags::DEFAULT;
    if include_untracked {
        flags |= StashFlags::INCLUDE_UNTRACKED;
    }

    repo.stash_save2(&sig, message, Some(flags))
        .map_err(|e| AppError::Git(e).to_string())?;

    Ok(())
}

/// Applies a stash and removes it from the list
pub fn stash_pop(repo: &mut Repository, index: usize) -> Result<(), String> {
    repo.stash_pop(index, None)
        .map_err(|e| AppError::Git(e).to_string())
}

/// Applies a stash without removing it from the list
pub fn stash_apply(repo: &mut Repository, index: usize) -> Result<(), String> {
    repo.stash_apply(index, None)
        .map_err(|e| AppError::Git(e).to_string())
}

/// Drops a stash from the list by index
pub fn stash_drop(repo: &mut Repository, index: usize) -> Result<(), String> {
    repo.stash_drop(index)
        .map_err(|e| AppError::Git(e).to_string())
}

/// Lists all stashes in the repository
pub fn list_stashes(repo: &mut Repository) -> Result<Vec<GitStash>, String> {
    let mut stashes_info = Vec::new();

    let res = repo.stash_foreach(|index, message, commit_oid| {
        stashes_info.push((index, message.to_string(), *commit_oid));
        true
    });

    if let Err(e) = res {
        return Err(AppError::Git(e).into());
    }

    let mut stashes = Vec::new();
    for (index, message, commit_oid) in stashes_info {
        let commit = repo.find_commit(commit_oid).map_err(AppError::Git)?;
        let timestamp = commit.time().seconds();

        stashes.push(GitStash {
            index,
            message,
            branch: "HEAD".to_string(),
            commit_oid: commit_oid.to_string(),
            timestamp,
            files_count: 0,
            additions: 0,
            deletions: 0,
        });
    }

    Ok(stashes)
}

/// Re-stores a commit as a new stash entry (top of stack) — used to undo a stash
/// pop/drop by recreating the entry from its previously-captured commit OID. Shells out to
/// `git stash store` because libgit2 has no equivalent to recreate a stash entry from an
/// arbitrary commit OID.
pub fn run_stash_store(path: &str, commit_oid: &str, message: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("cmd");
    #[cfg(target_os = "windows")]
    cmd.args(["/C", "git", "stash", "store", "-m", message, commit_oid]);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = std::process::Command::new("git");
    #[cfg(not(target_os = "windows"))]
    cmd.args(["stash", "store", "-m", message, commit_oid]);

    cmd.current_dir(path);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run git stash store: {}", e))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(format!("git stash store failed: {}", err_msg));
    }

    Ok(())
}

/// Modifies the message of a stash at the given index.
///
/// Every stash the app knows about lives entirely in the reflog of `refs/stash` — `git2`'s
/// `stash_foreach`/`stash_drop` and the `git stash` CLI all just read/write that one reflog, one
/// entry per stash. Renaming an entry therefore never needs to touch a stash's *commit*, and
/// (since renaming never changes which commit is on top of the stack) never needs to repoint
/// `refs/stash` itself either — only that one entry's message text changes.
///
/// This is implemented entirely through `git2`'s in-memory `Reflog` object. `Repository::reflog`
/// loads a copy of the on-disk reflog; `Reflog::append`/`remove` mutate only that in-memory copy,
/// and `Reflog::write` is the *only* call that touches disk (a single atomic write, per its own
/// doc comment). So the whole "clear it, then rebuild it" step happens off disk: every original
/// entry is captured and its commit validated as still resolvable *before* the in-memory copy is
/// cleared, and `write()` is the single disk mutation in the entire function, called only once
/// every entry has been successfully re-appended in memory.
///
/// This used to be implemented by dropping the whole stack via `repo.stash_drop(0)` in a loop
/// (each call an immediate, irreversible disk write) and then shelling out to `git stash store`
/// once per stash to rebuild it, with no rollback if a `git stash store` call failed partway
/// through — see #506, where that could permanently lose every stash not yet re-stored. The only
/// residual risk left by this version is `write()` itself failing (e.g. a concurrent process
/// holding the reflog's lock file): that is a single atomic operation rather than N sequential
/// external process spawns, and per `git_reflog_write`'s contract it either fully replaces the
/// on-disk reflog or leaves it untouched — there is no partially-written state for it to fail
/// into.
pub fn edit_stash_message(
    repo: &mut Repository,
    index: usize,
    message: &str,
) -> Result<(), String> {
    let mut reflog = repo.reflog("refs/stash").map_err(AppError::Git)?;
    let len = reflog.len();

    if index >= len {
        return Err(format!(
            "Stash index {} out of range (total stashes: {})",
            index, len
        ));
    }

    // Capture every entry, and validate its commit is still resolvable, before mutating
    // anything — this is the dry-run precondition check: a missing/corrupt stash commit aborts
    // the whole rename here, before the in-memory reflog is even cleared, let alone written.
    struct Entry {
        commit_oid: Oid,
        committer: Signature<'static>,
        message: String,
    }
    let mut entries = Vec::with_capacity(len);
    for i in 0..len {
        let raw_entry = reflog
            .get(i)
            .ok_or_else(|| format!("Failed to read stash reflog entry {i}"))?;
        let commit_oid = raw_entry.id_new();
        repo.find_commit(commit_oid).map_err(AppError::Git)?;

        let new_message = if i == index {
            message.to_string()
        } else {
            raw_entry.message().unwrap_or_default().to_string()
        };
        entries.push(Entry {
            commit_oid,
            committer: raw_entry.committer().to_owned(),
            message: new_message,
        });
    }

    // Only now that every entry has been validated: clear the in-memory reflog and rebuild it.
    // Still entirely in-memory — nothing on disk changes until `write()` below.
    for _ in 0..len {
        reflog.remove(0, false).map_err(AppError::Git)?;
    }
    // Re-append oldest to newest: `append` always adds the new top-of-stack entry, so replaying
    // in that order reproduces the original stack order (index 0 = newest, same as before).
    for entry in entries.iter().rev() {
        reflog
            .append(entry.commit_oid, &entry.committer, Some(&entry.message))
            .map_err(AppError::Git)?;
    }

    reflog.write().map_err(AppError::Git)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Oid;
    use std::path::{Path, PathBuf};

    fn init_repo(name: &str) -> (PathBuf, Repository) {
        let dir =
            std::env::temp_dir().join(format!("gm-test-stash-{}-{}", name, std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    fn commit_file(repo: &Repository, dir: &Path, name: &str, content: &str, msg: &str) -> Oid {
        std::fs::write(dir.join(name), content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(name)).unwrap();
        index.write().unwrap();
        let tree_oid = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        let sig = get_git_signature(repo).unwrap();
        let parent = repo
            .head()
            .ok()
            .and_then(|h| h.target())
            .and_then(|o| repo.find_commit(o).ok());
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents)
            .unwrap()
    }

    fn read_file(dir: &Path, name: &str) -> String {
        std::fs::read_to_string(dir.join(name)).unwrap()
    }

    #[test]
    fn stash_push_reverts_the_working_tree_and_records_an_entry() {
        let (dir, mut repo) = init_repo("push-basic");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");
        std::fs::write(dir.join("a.txt"), "dirty\n").unwrap();

        stash_push(&mut repo, Some("wip work"), false).unwrap();

        assert_eq!(read_file(&dir, "a.txt"), "base\n");
        let stashes = list_stashes(&mut repo).unwrap();
        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].index, 0);
        assert!(
            stashes[0].message.contains("wip work"),
            "unexpected stash message: {:?}",
            stashes[0].message
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stash_push_include_untracked_removes_new_files_too() {
        let (dir, mut repo) = init_repo("push-untracked");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();

        stash_push(&mut repo, None, true).unwrap();

        assert!(
            !dir.join("new.txt").exists(),
            "untracked file should have been swept into the stash"
        );
        assert_eq!(list_stashes(&mut repo).unwrap().len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stash_push_without_include_untracked_leaves_new_files_in_place() {
        let (dir, mut repo) = init_repo("push-no-untracked");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");
        // A tracked change is required for stash_save2 to have anything to stash at all —
        // untracked-only changes are skipped entirely unless INCLUDE_UNTRACKED is set.
        std::fs::write(dir.join("a.txt"), "dirty\n").unwrap();
        std::fs::write(dir.join("new.txt"), "new\n").unwrap();

        stash_push(&mut repo, None, false).unwrap();

        assert!(
            dir.join("new.txt").exists(),
            "untracked file must survive a non-untracked stash"
        );
        assert_eq!(read_file(&dir, "a.txt"), "base\n");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stash_push_errors_when_there_is_nothing_to_stash() {
        let (dir, mut repo) = init_repo("push-empty");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");

        assert!(stash_push(&mut repo, None, false).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_stashes_orders_most_recent_first() {
        let (dir, mut repo) = init_repo("list-order");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");

        std::fs::write(dir.join("a.txt"), "first change\n").unwrap();
        stash_push(&mut repo, Some("first"), false).unwrap();
        std::fs::write(dir.join("a.txt"), "second change\n").unwrap();
        stash_push(&mut repo, Some("second"), false).unwrap();

        let stashes = list_stashes(&mut repo).unwrap();
        assert_eq!(stashes.len(), 2);
        assert_eq!(stashes[0].index, 0);
        assert!(stashes[0].message.contains("second"));
        assert_eq!(stashes[1].index, 1);
        assert!(stashes[1].message.contains("first"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stash_pop_reapplies_and_removes_the_entry() {
        let (dir, mut repo) = init_repo("pop-basic");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");
        std::fs::write(dir.join("a.txt"), "dirty\n").unwrap();
        stash_push(&mut repo, Some("wip"), false).unwrap();

        stash_pop(&mut repo, 0).unwrap();

        assert_eq!(read_file(&dir, "a.txt"), "dirty\n");
        assert!(list_stashes(&mut repo).unwrap().is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stash_apply_reapplies_but_keeps_the_entry() {
        let (dir, mut repo) = init_repo("apply-basic");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");
        std::fs::write(dir.join("a.txt"), "dirty\n").unwrap();
        stash_push(&mut repo, Some("wip"), false).unwrap();

        stash_apply(&mut repo, 0).unwrap();

        assert_eq!(read_file(&dir, "a.txt"), "dirty\n");
        assert_eq!(list_stashes(&mut repo).unwrap().len(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stash_drop_removes_the_entry_without_reapplying() {
        let (dir, mut repo) = init_repo("drop-basic");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");
        std::fs::write(dir.join("a.txt"), "dirty\n").unwrap();
        stash_push(&mut repo, Some("wip"), false).unwrap();

        stash_drop(&mut repo, 0).unwrap();

        assert_eq!(read_file(&dir, "a.txt"), "base\n");
        assert!(list_stashes(&mut repo).unwrap().is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn stash_pop_errors_on_an_out_of_range_index() {
        let (dir, mut repo) = init_repo("pop-oob");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");

        assert!(stash_pop(&mut repo, 0).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn run_stash_store_recreates_an_entry_from_a_commit_oid() {
        let (dir, mut repo) = init_repo("store-basic");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");
        std::fs::write(dir.join("a.txt"), "dirty\n").unwrap();
        stash_push(&mut repo, Some("wip"), false).unwrap();

        let stash_oid = list_stashes(&mut repo).unwrap()[0].commit_oid.clone();
        stash_drop(&mut repo, 0).unwrap();
        assert!(list_stashes(&mut repo).unwrap().is_empty());

        run_stash_store(dir.to_str().unwrap(), &stash_oid, "restored wip").unwrap();

        let stashes = list_stashes(&mut repo).unwrap();
        assert_eq!(stashes.len(), 1);
        assert_eq!(stashes[0].commit_oid, stash_oid);
        assert!(stashes[0].message.contains("restored wip"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn edit_stash_message_renames_the_target_entry_and_preserves_others() {
        let (dir, mut repo) = init_repo("edit-message");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");

        std::fs::write(dir.join("a.txt"), "first change\n").unwrap();
        stash_push(&mut repo, Some("first"), false).unwrap();
        std::fs::write(dir.join("a.txt"), "second change\n").unwrap();
        stash_push(&mut repo, Some("second"), false).unwrap();

        let before = list_stashes(&mut repo).unwrap();
        let target_oid = before[1].commit_oid.clone(); // "first", now at index 1

        edit_stash_message(&mut repo, 1, "renamed first").unwrap();

        let after = list_stashes(&mut repo).unwrap();
        assert_eq!(after.len(), 2);
        assert!(after[0].message.contains("second"));
        assert!(after[1].message.contains("renamed first"));
        assert_eq!(after[1].commit_oid, target_oid);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn edit_stash_message_errors_on_an_out_of_range_index() {
        let (dir, mut repo) = init_repo("edit-oob");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");
        std::fs::write(dir.join("a.txt"), "dirty\n").unwrap();
        stash_push(&mut repo, Some("wip"), false).unwrap();

        let err = edit_stash_message(&mut repo, 5, "renamed").unwrap_err();
        assert!(err.contains("out of range"));
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Regression test for #506: a failure partway through the rename must not lose any
    /// previously-existing stash. We simulate the kind of mid-rebuild failure that used to be
    /// unrecoverable (a stash whose backing commit can't be resolved — e.g. pruned by a
    /// concurrent `git gc`) by injecting a bogus reflog entry alongside two real stashes, then
    /// assert the on-disk reflog still holds all three entries, untouched, after the rename call
    /// fails.
    #[test]
    fn edit_stash_message_leaves_every_stash_intact_when_a_reflog_entry_is_unresolvable() {
        let (dir, mut repo) = init_repo("edit-mid-failure");
        commit_file(&repo, &dir, "a.txt", "base\n", "base");

        std::fs::write(dir.join("a.txt"), "first change\n").unwrap();
        stash_push(&mut repo, Some("first"), false).unwrap();
        std::fs::write(dir.join("a.txt"), "second change\n").unwrap();
        stash_push(&mut repo, Some("second"), false).unwrap();

        // Inject a third reflog entry pointing at a commit oid that doesn't exist in the object
        // database — `Reflog::append` doesn't validate the oid, so this reproduces a dangling
        // stash entry without needing an actual `git stash store` failure.
        let bogus_oid = Oid::from_str("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef").unwrap();
        let committer = get_git_signature(&repo).unwrap();
        {
            let mut reflog = repo.reflog("refs/stash").unwrap();
            reflog
                .append(bogus_oid, &committer, Some("corrupt entry"))
                .unwrap();
            reflog.write().unwrap();
        }

        assert_eq!(repo.reflog("refs/stash").unwrap().len(), 3);

        let err = edit_stash_message(&mut repo, 1, "renamed second").unwrap_err();
        assert!(!err.is_empty());

        // Nothing was dropped: the reflog still has all 3 entries, with every original message
        // (including the injected corrupt one) intact and unchanged.
        let reflog = repo.reflog("refs/stash").unwrap();
        assert_eq!(reflog.len(), 3);
        let messages: Vec<String> = (0..reflog.len())
            .map(|i| {
                reflog
                    .get(i)
                    .unwrap()
                    .message()
                    .unwrap_or_default()
                    .to_string()
            })
            .collect();
        assert!(messages.iter().any(|m| m.contains("first")));
        assert!(messages.iter().any(|m| m.contains("second")));
        assert!(messages.iter().any(|m| m.contains("corrupt entry")));

        std::fs::remove_dir_all(&dir).ok();
    }
}
