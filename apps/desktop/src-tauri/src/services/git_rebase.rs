use crate::error::AppError;
use crate::models::RebaseState;
use git2::{Repository, RepositoryState};
use std::fs;
use std::path::{Path, PathBuf};

/// Inspects the repository's on-disk rebase state (if any) and reports its progress.
///
/// libgit2's `Repository::open_rebase` explicitly does not support the "merge"/interactive
/// backend (`Error: "interactive rebase is not supported"`) — and that backend is what the
/// `git` CLI uses by default for *every* rebase since Git 2.26, not just `-i` ones. So instead
/// of the high-level `Rebase` API, this reads the same on-disk plumbing files `git` itself
/// writes under `.git/rebase-merge/` (or `.git/rebase-apply/` for the older am-based backend),
/// which is the only way to get step progress today.
///
/// `kind` is one of:
/// - `"idle"`: no rebase in progress.
/// - `"conflict"`: paused because the current step has unresolved conflicts (index-based,
///   independent of which backend is in use).
/// - `"edit_pause"`: paused on a `reword`/`edit` step with no conflicts — detected the same way
///   `git`'s own bash prompt script does, by checking the last completed step in `done`.
/// - `"in_progress"`: a rebase is under way, paused for another reason (or mid-apply).
pub fn get_rebase_state(repo: &Repository) -> Result<RebaseState, AppError> {
    let is_rebasing = matches!(
        repo.state(),
        RepositoryState::Rebase | RepositoryState::RebaseInteractive | RepositoryState::RebaseMerge
    );

    if !is_rebasing {
        return Ok(idle_state());
    }

    let progress = read_rebase_progress(repo.path());
    let conflicted_files = conflicted_paths(repo)?;

    let kind = if !conflicted_files.is_empty() {
        "conflict"
    } else if progress
        .last_done_line
        .as_deref()
        .map(is_edit_or_reword_line)
        .unwrap_or(false)
    {
        "edit_pause"
    } else {
        "in_progress"
    };

    Ok(RebaseState {
        kind: kind.to_string(),
        current_step: progress.current_step,
        total_steps: progress.total_steps,
        current_oid: progress.current_oid,
        conflicted_files: if conflicted_files.is_empty() {
            None
        } else {
            Some(conflicted_files)
        },
    })
}

fn idle_state() -> RebaseState {
    RebaseState {
        kind: "idle".to_string(),
        current_step: None,
        total_steps: None,
        current_oid: None,
        conflicted_files: None,
    }
}

struct RebaseProgress {
    current_step: Option<usize>,
    total_steps: Option<usize>,
    current_oid: Option<String>,
    last_done_line: Option<String>,
}

/// Reads `git`'s own rebase state directory directly — `rebase-merge` (interactive/merge
/// backend, the default since Git 2.26) or `rebase-apply` (older am-based backend) — since
/// libgit2 can't describe either via its high-level `Rebase` API for the merge backend.
fn read_rebase_progress(git_dir: &Path) -> RebaseProgress {
    let merge_dir = git_dir.join("rebase-merge");
    let apply_dir = git_dir.join("rebase-apply");

    let (dir, current_file, total_file) = if merge_dir.is_dir() {
        (merge_dir, "msgnum", "end")
    } else if apply_dir.is_dir() {
        (apply_dir, "next", "last")
    } else {
        return RebaseProgress {
            current_step: None,
            total_steps: None,
            current_oid: None,
            last_done_line: None,
        };
    };

    RebaseProgress {
        current_step: read_usize(&dir.join(current_file)),
        total_steps: read_usize(&dir.join(total_file)),
        current_oid: read_trimmed(&dir.join("stopped-sha")),
        last_done_line: read_trimmed(&dir.join("done"))
            .and_then(|s| s.lines().last().map(|l| l.to_string())),
    }
}

fn read_trimmed(path: &PathBuf) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn read_usize(path: &PathBuf) -> Option<usize> {
    read_trimmed(path).and_then(|s| s.parse().ok())
}

/// A `done`-file line looks like `edit <oid> # <subject>` or `reword <oid> # <subject>`
/// (also `e`/`r` in short form) — matches the same heuristic used by Git's own
/// `contrib/completion/git-prompt.sh` to show `|REBASE-i>EDIT`-style prompts.
fn is_edit_or_reword_line(line: &str) -> bool {
    let action = line.split_whitespace().next().unwrap_or("");
    matches!(action, "edit" | "e" | "reword" | "r")
}

fn conflicted_paths(repo: &Repository) -> Result<Vec<String>, AppError> {
    let index = repo.index().map_err(AppError::Git)?;
    let paths = index
        .conflicts()
        .map_err(AppError::Git)?
        .filter_map(|c| c.ok())
        .filter_map(|c| c.our.or(c.their).or(c.ancestor))
        .filter_map(|entry| String::from_utf8(entry.path).ok())
        .collect();
    Ok(paths)
}
