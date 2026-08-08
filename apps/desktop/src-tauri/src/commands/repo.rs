use crate::error::AppError;
use crate::models::*;
use crate::services::git_repo::build_git_repo;
use crate::state::AppState;
use git2::Repository;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

/// Grants the `asset:` protocol read access to a repository's directory.
///
/// The protocol's configured scope is empty (`tauri.conf.json`), so the webview can't read a single
/// file until a repository is actually opened — the markdown renderer resolves a README's relative
/// images through `convertFileSrc`, and this is what makes those, and only those, load. Widening
/// the scope to `**` instead would hand every file on the machine to whatever markdown the user
/// happens to be looking at (a cloned README, a PR description written by a stranger).
///
/// Failing to register the directory only costs images in that repository, so it's logged and
/// swallowed rather than failing the command that opens the repo.
fn allow_repo_assets(app: &AppHandle, path: &str) {
    let scope = app.asset_protocol_scope();

    // The scope canonicalizes the *requested* path before matching it, but stores the allowed
    // patterns verbatim: registering only the path as it was typed would reject every image in a
    // repository reached through a symlink (`/tmp` resolves to `/private/tmp` on macOS, and a
    // symlinked projects directory is common enough). Both spellings go in.
    let mut paths = vec![PathBuf::from(path)];
    match std::fs::canonicalize(path) {
        Ok(canonical) if canonical != paths[0] => paths.push(canonical),
        _ => {}
    }

    for path in paths {
        if let Err(err) = scope.allow_directory(&path, true) {
            eprintln!("Failed to grant asset access to {}: {err}", path.display());
        }
    }
}

/// Opens a Git repository and returns its basic information.
#[tauri::command]
pub async fn open_repo(
    app: AppHandle,
    path: String,
    state: State<'_, AppState>,
) -> Result<GitRepo, String> {
    let repo = Repository::open(&path).map_err(|_| AppError::RepoNotFound(path.clone()))?;
    let git_repo = build_git_repo(&repo, path.clone());

    allow_repo_assets(&app, &path);

    // Register the repository in the app state
    state.open_repos.lock().unwrap().insert(path.clone(), path);

    Ok(git_repo)
}

/// Clones a remote repository to a local path.
///
/// The `git clone` subprocess runs on a blocking-pool thread — like `fetch_remote`, it's a
/// synchronous, unbounded network call, and `Command::output()` blocks the calling thread until
/// the child exits. `state`/`app` aren't `'static` (their lifetime is this call's), so the app-state
/// bookkeeping and asset-scope grant stay on the command's own async task, after the clone
/// finishes — both are fast, in-memory operations, not part of what could hang.
#[tauri::command]
pub async fn clone_repo(
    app: AppHandle,
    url: String,
    dest_path: String,
    shallow: Option<bool>,
    sparse: Option<bool>,
    state: State<'_, AppState>,
) -> Result<GitRepo, String> {
    use std::process::Command;

    let clone_dest = dest_path.clone();
    let git_repo = tauri::async_runtime::spawn_blocking(move || -> Result<GitRepo, String> {
        let mut args = vec!["clone".to_string()];
        if shallow.unwrap_or(false) {
            args.push("--depth".to_string());
            args.push("1".to_string());
        }
        if sparse.unwrap_or(false) {
            args.push("--sparse".to_string());
        }
        args.push(url);
        args.push(clone_dest.clone());

        #[cfg(target_os = "windows")]
        let mut cmd = Command::new("cmd");
        #[cfg(target_os = "windows")]
        cmd.args(&["/C", "git"]);

        #[cfg(not(target_os = "windows"))]
        let mut cmd = Command::new("git");

        let output = cmd.args(&args).output().map_err(AppError::Io)?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
            return Err(AppError::Unknown(format!("Git clone failed: {}", err_msg)).into());
        }

        let repo = Repository::open(&clone_dest).map_err(AppError::Git)?;
        Ok(build_git_repo(&repo, clone_dest))
    })
    .await
    .map_err(|e| format!("clone task failed to complete: {e}"))??;

    allow_repo_assets(&app, &dest_path);

    state
        .open_repos
        .lock()
        .unwrap()
        .insert(dest_path.clone(), dest_path);

    Ok(git_repo)
}

/// Initializes a new Git repository in the given directory.
#[tauri::command]
pub async fn init_repo(path: String, state: State<'_, AppState>) -> Result<GitRepo, String> {
    let repo = Repository::init(&path).map_err(AppError::Git)?;
    let git_repo = build_git_repo(&repo, path.clone());

    state.open_repos.lock().unwrap().insert(path.clone(), path);

    Ok(git_repo)
}

/// Runs on a blocking-pool thread: computing status walks the whole working tree, so its cost
/// scales with repo size — see `fetch_remote`'s doc comment for why that shouldn't run directly
/// on this command's async task, given this is polled frequently.
#[tauri::command]
pub async fn get_repo_status(path: String) -> Result<GitStatus, String> {
    tauri::async_runtime::spawn_blocking(move || get_repo_status_blocking(path))
        .await
        .map_err(|e| format!("status task failed to complete: {e}"))?
}

fn get_repo_status_blocking(path: String) -> Result<GitStatus, String> {
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

/// Reports the multi-step git operation the repo is in the middle of (`merge`, `rebase`,
/// `cherry_pick`, `revert`, `bisect`, `apply_mailbox`), or `null` when there is none.
///
/// Exists so a flow that writes *several* commits in a row can refuse up front rather than corrupt
/// the operation halfway through — see `services::git_repo::get_pending_operation` for what each
/// state makes unsafe. `get_rebase_state` answers a narrower question (how far along a rebase is)
/// and says nothing about a merge.
#[tauri::command]
pub async fn get_pending_operation(path: String) -> Result<Option<String>, String> {
    let repo = Repository::open(&path).map_err(|_| AppError::RepoNotFound(path))?;
    Ok(crate::services::git_repo::get_pending_operation(&repo).map(str::to_string))
}

/// Scans a root directory for Git repositories.
///
/// Runs on a blocking-pool thread: the recursive filesystem walk below can take real time on a
/// large directory tree — see `fetch_remote`'s doc comment.
#[tauri::command]
pub async fn scan_repos(root_path: String, max_depth: usize) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut found = Vec::new();
        scan_dir(&root_path, 0, max_depth, &mut found);
        found
    })
    .await
    .map_err(|e| format!("scan task failed to complete: {e}"))
}

fn scan_dir(path: &str, depth: usize, max_depth: usize, found: &mut Vec<String>) {
    if depth > max_depth {
        return;
    }

    let git_path = format!("{}/.git", path);
    if std::path::Path::new(&git_path).exists() {
        found.push(path.to_string());
        return; // Don't scan inside a repository
    }

    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                // Skip the usual directories known never to be repositories
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

/// Gets a quick summary of a repository (branch, changes, ahead/behind commit counts).
///
/// Runs on a blocking-pool thread — see `get_repo_status`'s doc comment; this is the one shown
/// per repo card on the dashboard, so it runs once per open tab.
#[tauri::command]
pub async fn get_repo_summary(path: String) -> Result<GitRepoSummary, String> {
    tauri::async_runtime::spawn_blocking(move || get_repo_summary_blocking(path))
        .await
        .map_err(|e| format!("summary task failed to complete: {e}"))?
}

fn get_repo_summary_blocking(path: String) -> Result<GitRepoSummary, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

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

/// Opens a Git repository in the editor the user picked (an absolute path to a `.app` bundle or
/// an executable, selected through the native picker).
#[tauri::command]
pub async fn open_in_editor(path: String, command: String) -> Result<(), String> {
    if command.is_empty() {
        return Err(AppError::InvalidInput("No editor application configured".to_string()).into());
    }

    // macOS .app bundles (picked via the native file dialog) can't be
    // executed directly — they must be launched through `open -a`.
    #[cfg(target_os = "macos")]
    if command.ends_with(".app") {
        return std::process::Command::new("open")
            .args(["-a", &command, &path])
            .spawn()
            .map(|_| ())
            .map_err(|e| AppError::Io(e).into());
    }

    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd")
        .args(["/C", &command, &path])
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let status = std::process::Command::new(&command).arg(&path).spawn();

    status.map(|_| ()).map_err(|e| AppError::Io(e).into())
}

/// Reads the repository's README file if there is one.
#[tauri::command]
pub async fn get_repo_readme(app: AppHandle, path: String) -> Result<String, String> {
    let dir = std::path::Path::new(&path);
    if !dir.exists() {
        return Err(AppError::RepoNotFound(path).into());
    }

    // The dashboard renders a README's images without necessarily having opened the repository in a
    // tab, so grant the asset scope here too rather than relying on `open_repo` having run.
    allow_repo_assets(&app, &path);

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
                Err(e) => return Err(AppError::Io(e).into()),
            }
        }
    }

    Err(AppError::Unknown("No README file found in this repository".to_string()).into())
}

/// Opens a terminal in the given directory using the user's chosen application (an absolute path to
/// a `.app` bundle or an executable). An empty `command` means "use the system default terminal".
#[tauri::command]
pub async fn open_in_terminal(path: String, command: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // An empty command falls back to the system default terminal (Terminal.app). Both it and a
        // configured `.app` bundle (picked via the native file dialog) must be launched via `open -a`
        // rather than executed directly.
        if command.trim().is_empty() || command.ends_with(".app") {
            let app = if command.trim().is_empty() {
                "Terminal"
            } else {
                command.as_str()
            };
            return std::process::Command::new("open")
                .args(["-a", app, &path])
                .spawn()
                .map(|_| ())
                .map_err(|e| AppError::Io(e).into());
        }
    }

    #[cfg(not(target_os = "macos"))]
    if command.is_empty() {
        return Err(
            AppError::InvalidInput("No terminal application configured".to_string()).into(),
        );
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

    status.map(|_| ()).map_err(|e| AppError::Io(e).into())
}

/// Reveals an arbitrary filesystem path in the Finder — e.g. a linked worktree's directory from the
/// commit graph's `WIP:<path>` row context menu. Generic over `activity_log`'s/
/// `daily_summary_archive`'s reveal commands: those always point at one of the app's own fixed
/// directories, this one takes whatever path the caller already has in hand.
#[tauri::command]
pub async fn reveal_path_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| AppError::Io(e).into())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err(AppError::Unknown(
            "Revealing a path in the file manager is only supported on macOS".to_string(),
        )
        .into())
    }
}

/// The history files read, in the order they are reported.
const HISTORY_FILES: [&str; 2] = [".zsh_history", ".bash_history"];

/// How many of each file's most recent git commands are reported, so the payload can't grow with the
/// history. Per file, deliberately: a cap over the two files merged could drop a live `.zsh_history`
/// entirely behind a long, stale `.bash_history`.
const MAX_HISTORY_COMMANDS: usize = 100;

/// One shell history file's `git …` command lines.
///
/// **Per file, never merged into one list.** The frontend spots the commands the user just ran by
/// diffing a read against the previous one, which only works on an append-only stream
/// (`lib/rewards/terminalHistory.ts`). Concatenating the two files broke that invariant in a way no
/// type could catch: a command appended to the live `.zsh_history` landed in the *middle* of the
/// merged list — before the `.bash_history` block — so it read as a rewritten history rather than as
/// something new, and the user was never credited for it.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalHistorySource {
    /// The file's name, e.g. `.zsh_history` — the key the frontend tracks its snapshot under.
    pub source: String,
    /// Its `git …` lines, oldest first, consecutive duplicates dropped, newest 100 kept.
    pub commands: Vec<String>,
}

/// Extracts the `git …` command lines from one shell history file, oldest first.
///
/// Lenient by design: a missing or unreadable file, or non-UTF-8 content, yields no commands rather
/// than an error — this feeds a gamification panel, and no reward is worth failing a read over.
fn read_git_history(path: &std::path::Path) -> Vec<String> {
    use std::fs::File;
    use std::io::Read;

    let Ok(mut file) = File::open(path) else {
        return Vec::new();
    };
    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return Vec::new();
    }

    let content = String::from_utf8_lossy(&bytes);
    let mut commands = Vec::new();
    for line in content.lines() {
        // zsh's EXTENDED_HISTORY writes `: <epoch>:<elapsed>;<command>`; bash writes the line as is.
        let cmd = if line.starts_with(':') {
            match line.find(';') {
                Some(pos) => &line[pos + 1..],
                None => line,
            }
        } else {
            line
        };
        let trimmed = cmd.trim();
        if trimmed.starts_with("git ") {
            commands.push(trimmed.to_string());
        }
    }

    // Drop consecutive duplicates
    commands.dedup();

    if commands.len() > MAX_HISTORY_COMMANDS {
        commands = commands.split_off(commands.len() - MAX_HISTORY_COMMANDS);
    }
    commands
}

/// Reads the system's zsh/bash history and extracts the commands starting with `git`, one entry per
/// history file (see `TerminalHistorySource` for why they are not merged). Files that are missing,
/// unreadable or hold no git command are simply absent from the result.
#[tauri::command]
pub async fn get_terminal_commands() -> Result<Vec<TerminalHistorySource>, String> {
    let home = std::env::var("HOME")
        .ok()
        .or_else(|| {
            #[allow(deprecated)]
            std::env::home_dir().map(|p| p.to_string_lossy().to_string())
        })
        .ok_or_else(|| {
            String::from(AppError::Unknown(
                "Could not find home directory".to_string(),
            ))
        })?;

    let home_path = std::path::Path::new(&home);
    Ok(HISTORY_FILES
        .iter()
        .map(|name| TerminalHistorySource {
            source: (*name).to_string(),
            commands: read_git_history(&home_path.join(name)),
        })
        .filter(|source| !source.commands.is_empty())
        .collect())
}

/// Returns the repository's tracked file paths (equivalent to `git ls-files`), sorted and
/// de-duplicated. Powers the command palette's "open a file" lookup.
#[tauri::command]
pub async fn list_tracked_files(path: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    crate::services::git_files::list_tracked_files(&repo).map_err(Into::into)
}

/// Returns every file in the working tree, tracked or not, minus what `.gitignore` excludes.
/// Powers the project files explorer.
#[tauri::command]
pub async fn get_repo_files(path: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&path).map_err(|_| AppError::RepoNotFound(path))?;
    crate::services::git_files::list_working_tree_files(&repo).map_err(Into::into)
}
