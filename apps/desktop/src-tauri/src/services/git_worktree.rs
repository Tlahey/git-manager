use crate::error::AppError;
use crate::models::GitWorktree;
use git2::Repository;
use std::path::Path;

/// Adds a new worktree at `dest_path`, checking out `from_ref` (a branch name or a
/// raw commit OID — either works as `git worktree add`'s revspec argument).
/// libgit2 has no reliable worktree-add API, so this shells out to `git` directly,
/// matching the precedent in `git_stash.rs::run_stash_store` for operations libgit2
/// can't cleanly perform.
pub fn add_worktree(repo_path: &str, dest_path: &str, from_ref: &str) -> Result<(), AppError> {
    if Path::new(dest_path).exists() {
        return Err(AppError::WorktreePathExists(dest_path.to_string()));
    }

    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("cmd");
    #[cfg(target_os = "windows")]
    cmd.args(["/C", "git", "worktree", "add", dest_path, from_ref]);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = std::process::Command::new("git");
    #[cfg(not(target_os = "windows"))]
    cmd.args(["worktree", "add", dest_path, from_ref]);

    cmd.current_dir(repo_path);

    let output = cmd
        .output()
        .map_err(|e| AppError::Unknown(format!("Failed to run git worktree add: {e}")))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(AppError::Unknown(format!(
            "git worktree add failed: {err_msg}"
        )));
    }

    Ok(())
}

/// Lists all worktrees for the repository via `git worktree list --porcelain`.
pub fn list_worktrees(repo_path: &str) -> Result<Vec<GitWorktree>, AppError> {
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("cmd");
    #[cfg(target_os = "windows")]
    cmd.args(["/C", "git", "worktree", "list", "--porcelain"]);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = std::process::Command::new("git");
    #[cfg(not(target_os = "windows"))]
    cmd.args(["worktree", "list", "--porcelain"]);

    cmd.current_dir(repo_path);

    let output = cmd
        .output()
        .map_err(|e| AppError::Unknown(format!("Failed to run git worktree list: {e}")))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(AppError::Unknown(format!(
            "git worktree list failed: {err_msg}"
        )));
    }

    let mut worktrees = parse_worktree_porcelain(&String::from_utf8_lossy(&output.stdout));
    for wt in worktrees.iter_mut().filter(|wt| !wt.is_main) {
        wt.is_dirty = match Repository::open(&wt.path) {
            Ok(repo) => repo.statuses(None).map(|s| !s.is_empty()).unwrap_or(false),
            Err(_) => false,
        };
    }

    Ok(worktrees)
}

#[derive(Default)]
struct WorktreeEntryBuilder {
    path: String,
    commit_oid: String,
    branch: String,
    is_locked: bool,
    is_prunable: bool,
    locked_reason: Option<String>,
}

impl WorktreeEntryBuilder {
    fn finish(self, is_main: bool) -> Option<GitWorktree> {
        if self.path.is_empty() {
            return None;
        }
        Some(GitWorktree {
            path: self.path,
            branch: self.branch,
            commit_oid: self.commit_oid,
            is_main,
            is_locked: self.is_locked,
            // Not derivable from the porcelain output itself — `list_worktrees` fills this in
            // afterward by opening each non-main worktree and checking its real status.
            is_dirty: false,
            is_prunable: self.is_prunable,
            locked_reason: self.locked_reason,
        })
    }
}

/// Parses `git worktree list --porcelain` output. Entries are separated by blank
/// lines; each has a `worktree <path>`, `HEAD <oid>`, and either `branch <ref>` or
/// `detached`, plus optional `locked [reason]`/`prunable [reason]`. The first entry
/// listed is always the main worktree.
fn parse_worktree_porcelain(output: &str) -> Vec<GitWorktree> {
    let mut worktrees = Vec::new();
    let mut current = WorktreeEntryBuilder::default();

    for line in output.lines() {
        if line.is_empty() {
            if let Some(entry) = current.finish(worktrees.is_empty()) {
                worktrees.push(entry);
            }
            current = WorktreeEntryBuilder::default();
            continue;
        }
        if let Some(rest) = line.strip_prefix("worktree ") {
            current.path = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("HEAD ") {
            current.commit_oid = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("branch ") {
            current.branch = rest.strip_prefix("refs/heads/").unwrap_or(rest).to_string();
        } else if line == "detached" {
            current.branch = "(detached HEAD)".to_string();
        } else if let Some(rest) = line.strip_prefix("locked") {
            current.is_locked = true;
            let reason = rest.trim_start();
            if !reason.is_empty() {
                current.locked_reason = Some(reason.to_string());
            }
        } else if line.starts_with("prunable") {
            current.is_prunable = true;
        }
    }
    if let Some(entry) = current.finish(worktrees.is_empty()) {
        worktrees.push(entry);
    }

    worktrees
}

/// Removes a worktree (`git worktree remove [--force] <path>`).
pub fn remove_worktree(repo_path: &str, worktree_path: &str, force: bool) -> Result<(), AppError> {
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(worktree_path);

    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("cmd");
    #[cfg(target_os = "windows")]
    {
        let mut win_args = vec!["/C", "git"];
        win_args.extend(args.iter());
        cmd.args(win_args);
    }

    #[cfg(not(target_os = "windows"))]
    let mut cmd = std::process::Command::new("git");
    #[cfg(not(target_os = "windows"))]
    cmd.args(&args);

    cmd.current_dir(repo_path);

    let output = cmd
        .output()
        .map_err(|e| AppError::Unknown(format!("Failed to run git worktree remove: {e}")))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(AppError::Unknown(format!(
            "git worktree remove failed: {err_msg}"
        )));
    }

    Ok(())
}
