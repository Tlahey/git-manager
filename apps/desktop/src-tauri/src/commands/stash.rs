use crate::error::AppError;
use crate::models::GitStash;
use git2::{Repository, StashFlags};

/// Creates a git stash
#[tauri::command]
pub async fn stash_push(
    path: String,
    message: Option<String>,
    include_untracked: Option<bool>,
) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;

    let config = repo.config().map_err(AppError::Git)?;
    let author_name = config
        .get_string("user.name")
        .unwrap_or_else(|_| "Unknown".to_string());
    let author_email = config
        .get_string("user.email")
        .unwrap_or_else(|_| "unknown@unknown.com".to_string());

    let sig = git2::Signature::now(&author_name, &author_email).map_err(AppError::Git)?;

    let mut flags = StashFlags::DEFAULT;
    if include_untracked.unwrap_or(false) {
        flags |= StashFlags::INCLUDE_UNTRACKED;
    }

    repo.stash_save2(&sig, message.as_deref(), Some(flags))
        .map_err(|e| AppError::Git(e).to_string())?;

    Ok(())
}

/// Applies a stash and removes it from the list
#[tauri::command]
pub async fn stash_pop(path: String, index: Option<usize>) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;
    let idx = index.unwrap_or(0);
    repo.stash_pop(idx, None).map_err(|e| AppError::Git(e).to_string())?;
    Ok(())
}

/// Applies a stash without removing it from the list
#[tauri::command]
pub async fn stash_apply(path: String, index: Option<usize>) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;
    let idx = index.unwrap_or(0);
    repo.stash_apply(idx, None).map_err(|e| AppError::Git(e).to_string())?;
    Ok(())
}

/// Drops a stash from the list by index
#[tauri::command]
pub async fn stash_drop(path: String, index: usize) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;
    repo.stash_drop(index).map_err(|e| AppError::Git(e).to_string())?;
    Ok(())
}

/// Lists all stashes in the repository
#[tauri::command]
pub async fn stash_list(path: String) -> Result<Vec<GitStash>, String> {
    let mut repo = Repository::open(&path).map_err(AppError::Git)?;
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

/// Modifies the message of a stash at the given index
#[tauri::command]
pub async fn edit_stash_message(
    path: String,
    index: usize,
    message: String,
) -> Result<(), String> {
    let mut repo = Repository::open(&path).map_err(|e| AppError::Git(e).to_string())?;

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
        repo.stash_drop(0).map_err(|e| AppError::Git(e).to_string())?;
    }

    // 3. Re-create the stashes from bottom to top of the stack.
    // Pushing in reverse order (bottom first) ensures they end up in their original stack position.
    for &(idx, ref original_msg, commit_oid) in stashes_info.iter().rev() {
        let msg_to_store = if idx == index {
            &message
        } else {
            original_msg
        };

        #[cfg(target_os = "windows")]
        let mut cmd = std::process::Command::new("cmd");
        #[cfg(target_os = "windows")]
        cmd.args(&["/C", "git", "stash", "store", "-m", msg_to_store, &commit_oid.to_string()]);

        #[cfg(not(target_os = "windows"))]
        let mut cmd = std::process::Command::new("git");
        #[cfg(not(target_os = "windows"))]
        cmd.args(&["stash", "store", "-m", msg_to_store, &commit_oid.to_string()]);

        cmd.current_dir(&path);

        let output = cmd.output().map_err(|e| format!("Failed to run git stash store: {}", e))?;
        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
            return Err(format!("git stash store failed: {}", err_msg));
        }
    }

    Ok(())
}

