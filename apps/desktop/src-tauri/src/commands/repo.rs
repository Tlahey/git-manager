use crate::error::AppError;
use crate::models::*;
use crate::state::AppState;
use git2::Repository;
use tauri::State;

/// Ouvre un dépôt Git et retourne ses informations de base
#[tauri::command]
pub async fn open_repo(path: String, state: State<'_, AppState>) -> Result<GitRepo, String> {
    let repo = Repository::open(&path).map_err(|_| AppError::RepoNotFound(path.clone()))?;

    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let head = repo
        .head()
        .ok()
        .and_then(|h| {
            if h.is_branch() {
                h.shorthand().map(|s| s.to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "HEAD".to_string());

    let is_detached = repo.head_detached().unwrap_or(false);

    let statuses = repo.statuses(None).map_err(AppError::Git)?;
    let is_dirty = !statuses.is_empty();

    let remotes = repo
        .remotes()
        .map(|r| r.iter().flatten().map(|s| s.to_string()).collect())
        .unwrap_or_default();

    // Enregistrer le repo dans l'état
    state
        .open_repos
        .lock()
        .unwrap()
        .insert(path.clone(), path.clone());

    Ok(GitRepo {
        path,
        name,
        head,
        is_detached,
        is_dirty,
        remotes,
    })
}

/// Construit un `GitRepo` à partir d'un dépôt ouvert et de son chemin
fn build_git_repo(repo: &Repository, path: String) -> GitRepo {
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let head = repo
        .head()
        .ok()
        .and_then(|h| {
            if h.is_branch() {
                h.shorthand().map(|s| s.to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "HEAD".to_string());

    let is_detached = repo.head_detached().unwrap_or(false);
    let is_dirty = repo
        .statuses(None)
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let remotes = repo
        .remotes()
        .map(|r| r.iter().flatten().map(|s| s.to_string()).collect())
        .unwrap_or_default();

    GitRepo {
        path,
        name,
        head,
        is_detached,
        is_dirty,
        remotes,
    }
}

/// Clone un dépôt distant vers un chemin local (auth SSH via agent)
#[tauri::command]
pub async fn clone_repo(
    url: String,
    dest_path: String,
    state: State<'_, AppState>,
) -> Result<GitRepo, String> {
    use git2::build::RepoBuilder;
    use git2::{Cred, FetchOptions, RemoteCallbacks};

    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|_url, username_from_url, _allowed| {
        Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
    });

    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);

    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch_options);

    let repo = builder
        .clone(&url, std::path::Path::new(&dest_path))
        .map_err(AppError::Git)?;

    let git_repo = build_git_repo(&repo, dest_path.clone());

    state
        .open_repos
        .lock()
        .unwrap()
        .insert(dest_path.clone(), dest_path);

    Ok(git_repo)
}

/// Initialise un nouveau dépôt Git dans le dossier indiqué
#[tauri::command]
pub async fn init_repo(path: String, state: State<'_, AppState>) -> Result<GitRepo, String> {
    let repo = Repository::init(&path).map_err(AppError::Git)?;
    let git_repo = build_git_repo(&repo, path.clone());

    state
        .open_repos
        .lock()
        .unwrap()
        .insert(path.clone(), path);

    Ok(git_repo)
}


#[tauri::command]
pub async fn get_repo_status(path: String) -> Result<GitStatus, String> {
    let repo = Repository::open(&path).map_err(|_| AppError::RepoNotFound(path))?;

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut opts)).map_err(AppError::Git)?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicted = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        if status.contains(git2::Status::CONFLICTED) {
            conflicted.push(path.clone());
            continue;
        }

        if status.contains(git2::Status::WT_NEW) {
            untracked.push(path.clone());
            continue;
        }

        // Index (staged)
        if status.intersects(
            git2::Status::INDEX_NEW
                | git2::Status::INDEX_MODIFIED
                | git2::Status::INDEX_DELETED
                | git2::Status::INDEX_RENAMED,
        ) {
            let kind = if status.contains(git2::Status::INDEX_NEW) {
                "added"
            } else if status.contains(git2::Status::INDEX_DELETED) {
                "deleted"
            } else if status.contains(git2::Status::INDEX_RENAMED) {
                "renamed"
            } else {
                "modified"
            };
            staged.push(GitStatusEntry {
                path: path.clone(),
                status: kind.to_string(),
                old_path: None,
            });
        }

        // Worktree (unstaged)
        if status.intersects(
            git2::Status::WT_MODIFIED | git2::Status::WT_DELETED | git2::Status::WT_RENAMED,
        ) {
            let kind = if status.contains(git2::Status::WT_DELETED) {
                "deleted"
            } else if status.contains(git2::Status::WT_RENAMED) {
                "renamed"
            } else {
                "modified"
            };
            unstaged.push(GitStatusEntry {
                path: path.clone(),
                status: kind.to_string(),
                old_path: None,
            });
        }
    }

    Ok(GitStatus {
        staged,
        unstaged,
        untracked,
        conflicted,
    })
}

/// Scanne un répertoire racine à la recherche de dépôts Git
#[tauri::command]
pub async fn scan_repos(root_path: String, max_depth: usize) -> Result<Vec<String>, String> {
    let mut found = Vec::new();
    scan_dir(&root_path, 0, max_depth, &mut found);
    Ok(found)
}

fn scan_dir(path: &str, depth: usize, max_depth: usize, found: &mut Vec<String>) {
    if depth > max_depth {
        return;
    }

    let git_path = format!("{}/.git", path);
    if std::path::Path::new(&git_path).exists() {
        found.push(path.to_string());
        return; // Ne pas scanner l'intérieur d'un repo
    }

    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                // Exclure les dossiers courants connus comme non-repos
                if !matches!(
                    name_str.as_ref(),
                    "node_modules" | ".pnpm-store" | "dist" | "build" | "target" | ".git"
                ) {
                    scan_dir(
                        entry_path.to_str().unwrap_or(""),
                        depth + 1,
                        max_depth,
                        found,
                    );
                }
            }
        }
    }
}
