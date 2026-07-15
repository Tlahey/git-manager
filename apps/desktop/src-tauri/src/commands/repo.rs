use crate::error::AppError;
use crate::models::*;
use crate::services::git_repo::build_git_repo;
use crate::state::AppState;
use git2::Repository;
use tauri::State;

/// Ouvre un dépôt Git et retourne ses informations de base
#[tauri::command]
pub async fn open_repo(path: String, state: State<'_, AppState>) -> Result<GitRepo, String> {
    let repo = Repository::open(&path).map_err(|_| AppError::RepoNotFound(path.clone()))?;
    let git_repo = build_git_repo(&repo, path.clone());

    // Enregistrer le repo dans l'état
    state.open_repos.lock().unwrap().insert(path.clone(), path);

    Ok(git_repo)
}

/// Clone un dépôt distant vers un chemin local
#[tauri::command]
pub async fn clone_repo(
    url: String,
    dest_path: String,
    shallow: Option<bool>,
    sparse: Option<bool>,
    state: State<'_, AppState>,
) -> Result<GitRepo, String> {
    use std::process::Command;

    let mut args = vec!["clone".to_string()];
    if shallow.unwrap_or(false) {
        args.push("--depth".to_string());
        args.push("1".to_string());
    }
    if sparse.unwrap_or(false) {
        args.push("--sparse".to_string());
    }
    args.push(url.clone());
    args.push(dest_path.clone());

    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("cmd");
    #[cfg(target_os = "windows")]
    cmd.args(&["/C", "git"]);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = Command::new("git");

    let output = cmd
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run git clone: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(format!("Git clone failed: {}", err_msg));
    }

    let repo = Repository::open(&dest_path)
        .map_err(|e| format!("Failed to open cloned repository: {}", e))?;
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

    state.open_repos.lock().unwrap().insert(path.clone(), path);

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

/// Obtient un résumé rapide (branche, modifications, commits ahead/behind) d'un dépôt Git
#[tauri::command]
pub async fn get_repo_summary(path: String) -> Result<GitRepoSummary, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;

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

    // Get status counts
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let statuses = repo.statuses(Some(&mut opts)).ok();

    let mut staged_count = 0;
    let mut unstaged_count = 0;
    let mut untracked_count = 0;
    let mut conflicted_count = 0;

    if let Some(statuses) = statuses {
        for entry in statuses.iter() {
            let status = entry.status();
            if status.contains(git2::Status::CONFLICTED) {
                conflicted_count += 1;
                continue;
            }
            if status.contains(git2::Status::WT_NEW) {
                untracked_count += 1;
                continue;
            }
            if status.intersects(
                git2::Status::INDEX_NEW
                    | git2::Status::INDEX_MODIFIED
                    | git2::Status::INDEX_DELETED
                    | git2::Status::INDEX_RENAMED,
            ) {
                staged_count += 1;
            }
            if status.intersects(
                git2::Status::WT_MODIFIED | git2::Status::WT_DELETED | git2::Status::WT_RENAMED,
            ) {
                unstaged_count += 1;
            }
        }
    }

    // Get ahead/behind counts for current HEAD branch vs upstream
    let mut ahead_count = 0;
    let mut behind_count = 0;
    if let Ok(head_branch) = repo.find_branch(&head, git2::BranchType::Local) {
        if let Ok(upstream_branch) = head_branch.upstream() {
            if let Some(head_oid) = head_branch.get().target() {
                if let Some(upstream_oid) = upstream_branch.get().target() {
                    if let Ok((ahead, behind)) = repo.graph_ahead_behind(head_oid, upstream_oid) {
                        ahead_count = ahead;
                        behind_count = behind;
                    }
                }
            }
        }
    }

    Ok(GitRepoSummary {
        path,
        name,
        head,
        is_detached,
        staged_count,
        unstaged_count,
        untracked_count,
        conflicted_count,
        ahead_count,
        behind_count,
    })
}

/// Ouvre un dépôt Git dans l'application d'édition choisie par l'utilisateur
/// (chemin absolu vers un .app ou un exécutable, sélectionné via le picker natif)
#[tauri::command]
pub async fn open_in_editor(path: String, command: String) -> Result<(), String> {
    if command.is_empty() {
        return Err("No editor application configured".to_string());
    }

    // macOS .app bundles (picked via the native file dialog) can't be
    // executed directly — they must be launched through `open -a`.
    #[cfg(target_os = "macos")]
    if command.ends_with(".app") {
        return std::process::Command::new("open")
            .args(["-a", &command, &path])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open editor: {}", e));
    }

    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd")
        .args(["/C", &command, &path])
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let status = std::process::Command::new(&command).arg(&path).spawn();

    status
        .map(|_| ())
        .map_err(|e| format!("Failed to open editor: {}", e))
}

/// Lit le contenu du fichier README du dépôt s'il existe
#[tauri::command]
pub async fn get_repo_readme(path: String) -> Result<String, String> {
    let dir = std::path::Path::new(&path);
    if !dir.exists() {
        return Err("Repository path does not exist".to_string());
    }

    let candidates = [
        "README.md",
        "readme.md",
        "README.markdown",
        "README",
        "Readme.md",
        "README.txt",
    ];

    for candidate in &candidates {
        let file_path = dir.join(candidate);
        if file_path.exists() && file_path.is_file() {
            match std::fs::read_to_string(&file_path) {
                Ok(content) => return Ok(content),
                Err(e) => return Err(format!("Failed to read README: {}", e)),
            }
        }
    }

    Err("No README file found in this repository".to_string())
}

/// Ouvre un terminal dans le répertoire spécifié, avec l'application choisie
/// par l'utilisateur (chemin absolu vers un .app ou un exécutable)
#[tauri::command]
pub async fn open_in_terminal(path: String, command: String) -> Result<(), String> {
    if command.is_empty() {
        return Err("No terminal application configured".to_string());
    }

    // macOS .app bundles (picked via the native file dialog) can't be
    // executed directly — they must be launched through `open -a`.
    #[cfg(target_os = "macos")]
    if command.ends_with(".app") {
        return std::process::Command::new("open")
            .args(["-a", &command, &path])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open terminal: {}", e));
    }

    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", &command])
        .current_dir(&path)
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let status = std::process::Command::new(&command)
        .current_dir(&path)
        .spawn();

    status
        .map(|_| ())
        .map_err(|e| format!("Failed to open terminal: {}", e))
}

/// Lit l'historique zsh/bash du système et extrait les commandes commençant par git
#[tauri::command]
pub async fn get_terminal_commands() -> Result<Vec<String>, String> {
    use std::fs::File;
    use std::io::Read;

    let home = std::env::var("HOME")
        .ok()
        .or_else(|| {
            #[allow(deprecated)]
            std::env::home_dir().map(|p| p.to_string_lossy().to_string())
        })
        .ok_or_else(|| "Could not find home directory".to_string())?;

    let mut commands = Vec::new();

    // Lecteur d'historique robuste acceptant le non-UTF-8
    let mut read_history = |path: std::path::PathBuf| {
        if path.exists() {
            if let Ok(mut file) = File::open(&path) {
                let mut bytes = Vec::new();
                if file.read_to_end(&mut bytes).is_ok() {
                    let content = String::from_utf8_lossy(&bytes);
                    for line in content.lines() {
                        let cmd = if line.starts_with(':') {
                            if let Some(pos) = line.find(';') {
                                line[pos + 1..].to_string()
                            } else {
                                line.to_string()
                            }
                        } else {
                            line.to_string()
                        };
                        let trimmed = cmd.trim().to_string();
                        if trimmed.starts_with("git ") && !trimmed.is_empty() {
                            commands.push(trimmed);
                        }
                    }
                }
            }
        }
    };

    let home_path = std::path::Path::new(&home);
    read_history(home_path.join(".zsh_history"));
    read_history(home_path.join(".bash_history"));

    // Élimine les répétitions consécutives identiques
    commands.dedup();

    // Garde les 100 dernières commandes pour éviter de saturer la mémoire
    if commands.len() > 100 {
        commands = commands.split_off(commands.len() - 100);
    }

    Ok(commands)
}
