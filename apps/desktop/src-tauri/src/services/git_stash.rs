use crate::error::AppError;
use crate::models::GitStash;
use crate::utils::get_git_signature;
use git2::{Repository, StashFlags};

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

/// Modifies the message of a stash at the given index
pub fn edit_stash_message(
    repo: &mut Repository,
    path: &str,
    index: usize,
    message: &str,
) -> Result<(), String> {
    // 1. Get the list of all stashes
    let mut stashes_info = Vec::new();
    let res = repo.stash_foreach(|idx, msg, commit_oid| {
        stashes_info.push((idx, msg.to_string(), *commit_oid));
        true
    });

    if let Err(e) = res {
        return Err(AppError::Git(e).to_string());
    }

    // Sort stashes by index ascending
    stashes_info.sort_by_key(|s| s.0);

    if index >= stashes_info.len() {
        return Err(format!(
            "Stash index {} out of range (total stashes: {})",
            index,
            stashes_info.len()
        ));
    }

    // 2. Drop all stashes. By dropping index 0 repeatedly, we clear the entire stack.
    for _ in 0..stashes_info.len() {
        repo.stash_drop(0)
            .map_err(|e| AppError::Git(e).to_string())?;
    }

    // 3. Re-create the stashes from bottom to top of the stack.
    // Pushing in reverse order (bottom first) ensures they end up in their original stack position.
    for &(idx, ref original_msg, commit_oid) in stashes_info.iter().rev() {
        let msg_to_store = if idx == index { message } else { original_msg };

        run_stash_store(path, &commit_oid.to_string(), msg_to_store)?;
    }

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

        edit_stash_message(&mut repo, dir.to_str().unwrap(), 1, "renamed first").unwrap();

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

        let err = edit_stash_message(&mut repo, dir.to_str().unwrap(), 5, "renamed").unwrap_err();
        assert!(err.contains("out of range"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
