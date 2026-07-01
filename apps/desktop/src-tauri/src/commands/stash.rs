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
