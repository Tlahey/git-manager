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
            Ok(repo) => {
                // Same options as `get_repo_status`: untracked files count, gitignored ones don't.
                // `statuses(None)` falls back to libgit2's GIT_STATUS_OPT_DEFAULTS, which ALSO
                // includes ignored entries — that flagged every worktree containing build
                // artifacts (node_modules/, target/, …) as permanently dirty, even though
                // `git status --porcelain` was empty and `git worktree remove` wouldn't block.
                let mut opts = git2::StatusOptions::new();
                opts.include_untracked(true);
                repo.statuses(Some(&mut opts))
                    .map(|s| !s.is_empty())
                    .unwrap_or(false)
            }
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

/// Removes administrative metadata for worktrees whose working directory no longer exists on
/// disk (`git worktree prune`) — the entries `list_worktrees` already flags via `is_prunable`.
pub fn prune_worktrees(repo_path: &str) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("cmd");
    #[cfg(target_os = "windows")]
    cmd.args(["/C", "git", "worktree", "prune"]);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = std::process::Command::new("git");
    #[cfg(not(target_os = "windows"))]
    cmd.args(["worktree", "prune"]);

    cmd.current_dir(repo_path);

    let output = cmd
        .output()
        .map_err(|e| AppError::Unknown(format!("Failed to run git worktree prune: {e}")))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(AppError::Unknown(format!(
            "git worktree prune failed: {err_msg}"
        )));
    }

    Ok(())
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

/// Returns local branch names whose upstream is "gone" — they tracked a remote branch that no
/// longer exists. This is the local, GitHub-independent signal that a worktree's branch is done:
/// after a PR merges, GitHub deletes the remote branch, and `git fetch --prune` drops the
/// `origin/<branch>` tracking ref, leaving the branch's upstream "gone". A worktree still sitting
/// on such a branch is a finished, merged-and-cleaned branch — eligible for bulk removal.
///
/// Branches that never had an upstream (purely local, never pushed) are NOT reported — their
/// `upstream:track` is empty, not `gone` — so unmerged local-only work is never flagged. Reads via
/// `git for-each-ref`, whose `%(upstream:track)` computes the gone/ahead/behind state directly;
/// `nobracket` strips the surrounding `[...]` so the field is a bare `gone`.
pub fn gone_upstream_branches(repo_path: &str) -> Result<Vec<String>, AppError> {
    const FORMAT: &str = "--format=%(refname:short)%09%(upstream:track,nobracket)";

    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("cmd");
    #[cfg(target_os = "windows")]
    cmd.args(["/C", "git", "for-each-ref", FORMAT, "refs/heads"]);

    #[cfg(not(target_os = "windows"))]
    let mut cmd = std::process::Command::new("git");
    #[cfg(not(target_os = "windows"))]
    cmd.args(["for-each-ref", FORMAT, "refs/heads"]);

    cmd.current_dir(repo_path);

    let output = cmd
        .output()
        .map_err(|e| AppError::Unknown(format!("Failed to run git for-each-ref: {e}")))?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(AppError::Unknown(format!(
            "git for-each-ref failed: {err_msg}"
        )));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let gone = text
        .lines()
        .filter_map(|line| line.split_once('\t'))
        .filter(|(_, track)| track.trim() == "gone")
        .map(|(name, _)| name.to_string())
        .collect();
    Ok(gone)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;

    /// Commits the current (empty) index onto HEAD — commits share the empty tree since only refs
    /// and their upstream config matter for the logic under test.
    fn commit(repo: &Repository, msg: &str) -> git2::Oid {
        let sig = get_git_signature(repo).unwrap();
        let tree_oid = repo.index().unwrap().write_tree().unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &[])
            .unwrap()
    }

    #[test]
    fn gone_upstream_branches_reports_only_branches_whose_upstream_disappeared() {
        let dir = std::env::temp_dir().join(format!("gm-test-wt-gone-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        let a = commit(&repo, "A");

        // `gone` tracks a remote branch that doesn't exist; `live` tracks one that does; `plain`
        // has no upstream at all (never pushed).
        repo.branch("gone", &repo.find_commit(a).unwrap(), true)
            .unwrap();
        repo.branch("live", &repo.find_commit(a).unwrap(), true)
            .unwrap();
        repo.branch("plain", &repo.find_commit(a).unwrap(), true)
            .unwrap();
        repo.reference("refs/remotes/origin/live", a, true, "seed")
            .unwrap();

        {
            let mut cfg = repo.config().unwrap();
            cfg.set_str("remote.origin.url", "https://example.invalid/r.git")
                .unwrap();
            cfg.set_str("remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*")
                .unwrap();
            cfg.set_str("branch.gone.remote", "origin").unwrap();
            cfg.set_str("branch.gone.merge", "refs/heads/gone").unwrap();
            cfg.set_str("branch.live.remote", "origin").unwrap();
            cfg.set_str("branch.live.merge", "refs/heads/live").unwrap();
        }

        let gone = gone_upstream_branches(dir.to_str().unwrap()).unwrap();
        assert!(
            gone.contains(&"gone".to_string()),
            "gone's upstream ref is missing"
        );
        assert!(
            !gone.contains(&"live".to_string()),
            "live's upstream ref exists"
        );
        assert!(
            !gone.contains(&"plain".to_string()),
            "plain never had an upstream"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_worktrees_dirtiness_counts_untracked_but_not_gitignored_files() {
        let dir = std::env::temp_dir().join(format!("gm-test-wt-dirty-{}", std::process::id()));
        let wt_dir =
            std::env::temp_dir().join(format!("gm-test-wt-dirty-linked-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::remove_dir_all(&wt_dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();

        // Commit a .gitignore so the linked worktree checks it out too.
        std::fs::write(dir.join(".gitignore"), "ignored.txt\n").unwrap();
        let sig = get_git_signature(&repo).unwrap();
        let commit_oid = {
            let mut index = repo.index().unwrap();
            index.add_path(Path::new(".gitignore")).unwrap();
            index.write().unwrap();
            let tree_oid = index.write_tree().unwrap();
            let tree = repo.find_tree(tree_oid).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
                .unwrap()
        };

        add_worktree(
            dir.to_str().unwrap(),
            wt_dir.to_str().unwrap(),
            &commit_oid.to_string(),
        )
        .unwrap();

        // A gitignored file (think node_modules/, target/) must NOT flag the worktree dirty —
        // `git status --porcelain` wouldn't list it, and `git worktree remove` doesn't block on it.
        std::fs::write(wt_dir.join("ignored.txt"), "x").unwrap();
        let worktrees = list_worktrees(dir.to_str().unwrap()).unwrap();
        let wt = worktrees.iter().find(|w| !w.is_main).unwrap();
        assert!(
            !wt.is_dirty,
            "gitignored files must not count as uncommitted changes"
        );

        // A genuinely untracked file must.
        std::fs::write(wt_dir.join("untracked.txt"), "x").unwrap();
        let worktrees = list_worktrees(dir.to_str().unwrap()).unwrap();
        let wt = worktrees.iter().find(|w| !w.is_main).unwrap();
        assert!(
            wt.is_dirty,
            "untracked files must count as uncommitted changes"
        );

        std::fs::remove_dir_all(&wt_dir).ok();
        std::fs::remove_dir_all(&dir).ok();
    }
}
