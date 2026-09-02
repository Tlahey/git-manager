use crate::error::AppError;
use crate::models::*;
use crate::services::git_repo::build_git_repo;
use crate::services::git_status;
use crate::state::AppState;
use crate::utils::resolve_workdir_file;
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
    git_status::classify_statuses(&repo).map_err(Into::into)
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

    // Status counts, from the same classification `get_repo_status` uses — see `git_status`'s
    // doc comment for why the two views must never each carry their own copy of these rules.
    let status = git_status::classify_statuses(&repo).ok();
    let staged_count = status.as_ref().map_or(0, |s| s.staged.len());
    let unstaged_count = status.as_ref().map_or(0, |s| s.unstaged.len());
    let untracked_count = status.as_ref().map_or(0, |s| s.untracked.len());
    let conflicted_count = status.as_ref().map_or(0, |s| s.conflicted.len());

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

const README_CANDIDATES: &[&str] = &[
    "README.md",
    "readme.md",
    "README.markdown",
    "README",
    "Readme.md",
    "README.txt",
];

/// Finds and reads the first matching README candidate under `path`.
///
/// Each candidate is resolved via `resolve_workdir_file` before reading — a candidate that is a
/// symlink pointing outside the repo (e.g. `README.md -> ~/.ssh/id_rsa`, dropped into a folder the
/// app merely knows about, not necessarily `git clone`d) is treated as if it weren't there at all
/// and the next candidate is tried, rather than following the symlink and returning its target's
/// content to the dashboard preview (issue #516, same bug class as #512). Split out from the
/// `#[tauri::command]` itself so it can be unit-tested without an `AppHandle`.
fn find_readme_content(path: &str) -> Result<String, AppError> {
    for candidate in README_CANDIDATES {
        let Some(resolved) = resolve_workdir_file(path, candidate) else {
            continue;
        };
        if resolved.is_file() {
            return std::fs::read_to_string(&resolved).map_err(AppError::Io);
        }
    }

    Err(AppError::Unknown(
        "No README file found in this repository".to_string(),
    ))
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

    find_readme_content(&path).map_err(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-repo-readme-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn finds_and_reads_an_ordinary_readme() {
        let dir = temp_dir("ordinary");
        std::fs::write(dir.join("README.md"), "# Hello").unwrap();

        assert_eq!(
            find_readme_content(dir.to_str().unwrap()).unwrap(),
            "# Hello"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn errors_when_no_readme_candidate_exists() {
        let dir = temp_dir("none");

        assert!(find_readme_content(dir.to_str().unwrap()).is_err());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_a_readme_symlink_escaping_the_repo() {
        let outside = temp_dir("escaping-target");
        std::fs::write(outside.join("secret.txt"), "top secret").unwrap();

        let repo = temp_dir("escaping-repo");
        std::os::unix::fs::symlink(outside.join("secret.txt"), repo.join("README.md")).unwrap();

        let result = find_readme_content(repo.to_str().unwrap());

        // No other candidate exists either, so this must fall through to "not found" rather
        // than ever surfacing the secret's content.
        assert!(result.is_err());

        std::fs::remove_dir_all(&outside).ok();
        std::fs::remove_dir_all(&repo).ok();
    }

    #[cfg(unix)]
    #[test]
    fn skips_an_escaping_symlink_candidate_and_falls_back_to_the_next_one() {
        let outside = temp_dir("escaping-fallback-target");
        std::fs::write(outside.join("secret.txt"), "top secret").unwrap();

        let repo = temp_dir("escaping-fallback-repo");
        // README.md (checked first) escapes the repo; README.markdown (checked later, and not
        // just a case variant of the first — macOS's default APFS is case-insensitive, so
        // "README.md"/"readme.md" would otherwise be the very same file) is ordinary.
        std::os::unix::fs::symlink(outside.join("secret.txt"), repo.join("README.md")).unwrap();
        std::fs::write(repo.join("README.markdown"), "ordinary readme").unwrap();

        let content = find_readme_content(repo.to_str().unwrap()).unwrap();

        assert_eq!(content, "ordinary readme");
        assert_ne!(content, "top secret");

        std::fs::remove_dir_all(&outside).ok();
        std::fs::remove_dir_all(&repo).ok();
    }

    #[cfg(unix)]
    #[test]
    fn follows_a_readme_symlink_that_stays_inside_the_repo() {
        let dir = temp_dir("inside-symlink");
        std::fs::write(dir.join("actual.md"), "in-repo content").unwrap();
        std::os::unix::fs::symlink(dir.join("actual.md"), dir.join("README.md")).unwrap();

        assert_eq!(
            find_readme_content(dir.to_str().unwrap()).unwrap(),
            "in-repo content"
        );

        std::fs::remove_dir_all(&dir).ok();
    }
}
