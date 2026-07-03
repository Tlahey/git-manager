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
