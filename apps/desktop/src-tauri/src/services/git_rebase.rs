use crate::error::AppError;
use crate::models::RebaseState;
use crate::services::git_rebase_plan;
use crate::utils::short_oid;
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

    // A conflict pause persists — from the user's point of view — until they run
    // continue/skip/abort, even after they've staged fixes for every file (index
    // conflicts go to zero, but `stopped-sha` stays on disk until the step is finished).
    // So "conflict" is driven by `current_oid` (the step being replayed), not by
    // `conflicted_files` being non-empty, or the panel would disappear the instant the
    // last file gets resolved — right when the user needs it most to click "Continue".
    let is_edit_pause = progress
        .last_done_line
        .as_deref()
        .map(is_edit_or_reword_line)
        .unwrap_or(false);
    let kind = if is_edit_pause {
        "edit_pause"
    } else if progress.current_oid.is_some() {
        "conflict"
    } else {
        "in_progress"
    };

    let current_message = progress
        .current_oid
        .as_deref()
        .and_then(|oid| git2::Oid::from_str(oid).ok())
        .and_then(|oid| repo.find_commit(oid).ok())
        .and_then(|commit| commit.message().map(str::to_string));

    // The full todo list, so the UI can show where the rebase stands rather than just a
    // step counter. Only a paused rebase has a step awaiting the user (see `read_rebase_steps`).
    let is_paused = kind == "conflict" || kind == "edit_pause";
    let steps = git_rebase_plan::read_rebase_steps(repo, repo.path(), is_paused);
    let onto = progress
        .onto_oid
        .as_deref()
        .map(|oid| describe_onto(repo, oid));

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
        branch_name: progress.branch_name,
        current_message,
        steps,
        onto_oid: progress.onto_oid.clone(),
        onto_short_oid: progress.onto_oid.as_deref().map(short_oid),
        onto_subject: onto.as_ref().and_then(|o| o.subject.clone()),
        onto_label: onto.and_then(|o| o.label),
    })
}

/// Human-readable description of the commit a rebase replays onto: its subject, plus the name
/// of a ref pointing exactly at it (`main`, `origin/main`…) when one exists — a rebase records
/// only the resolved oid, so the branch the user typed has to be recovered this way.
struct OntoDescription {
    subject: Option<String>,
    label: Option<String>,
}

fn describe_onto(repo: &Repository, oid: &str) -> OntoDescription {
    let commit = git2::Oid::from_str(oid)
        .ok()
        .and_then(|oid| repo.find_commit(oid).ok());

    OntoDescription {
        subject: commit
            .as_ref()
            .and_then(|c| c.summary().map(str::to_string)),
        label: onto_ref_name(repo, oid),
    }
}

/// Shorthand name of a local branch at `oid`, else a remote-tracking branch, else `None`.
/// Local branches are preferred: that's what the user rebased onto in the usual case.
fn onto_ref_name(repo: &Repository, oid: &str) -> Option<String> {
    let target = git2::Oid::from_str(oid).ok()?;
    let mut remote_match = None;

    for branch in repo.branches(None).ok()?.flatten() {
        let (branch, kind) = branch;
        if branch.get().peel_to_commit().map(|c| c.id()) != Ok(target) {
            continue;
        }
        let Ok(Some(name)) = branch.name() else {
            continue;
        };
        match kind {
            git2::BranchType::Local => return Some(name.to_string()),
            git2::BranchType::Remote => remote_match = remote_match.or(Some(name.to_string())),
        }
    }
    remote_match
}

fn idle_state() -> RebaseState {
    RebaseState {
        kind: "idle".to_string(),
        current_step: None,
        total_steps: None,
        current_oid: None,
        conflicted_files: None,
        branch_name: None,
        current_message: None,
        steps: Vec::new(),
        onto_oid: None,
        onto_short_oid: None,
        onto_subject: None,
        onto_label: None,
    }
}

struct RebaseProgress {
    current_step: Option<usize>,
    total_steps: Option<usize>,
    current_oid: Option<String>,
    last_done_line: Option<String>,
    branch_name: Option<String>,
    onto_oid: Option<String>,
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
            branch_name: None,
            onto_oid: None,
        };
    };

    RebaseProgress {
        current_step: read_usize(&dir.join(current_file)),
        total_steps: read_usize(&dir.join(total_file)),
        current_oid: read_trimmed(&dir.join("stopped-sha")),
        last_done_line: read_trimmed(&dir.join("done"))
            .and_then(|s| s.lines().last().map(|l| l.to_string())),
        // `head-name` holds the original branch being rebased, e.g. "refs/heads/feature".
        branch_name: read_trimmed(&dir.join("head-name"))
            .map(|s| s.trim_start_matches("refs/heads/").to_string()),
        // `onto` holds the resolved oid the branch is replayed onto (both backends write it).
        onto_oid: read_trimmed(&dir.join("onto")),
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

pub(crate) fn conflicted_paths(repo: &Repository) -> Result<Vec<String>, AppError> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn init_repo(name: &str) -> (PathBuf, Repository) {
        let dir = std::env::temp_dir().join(format!("gm-test-{}-{}", name, std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    /// Commits `file` with the given subject on top of HEAD and returns its oid.
    fn commit(repo: &Repository, dir: &Path, file: &str, subject: &str) -> git2::Oid {
        fs::write(dir.join(file), subject).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(file)).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let sig = git2::Signature::now("T", "t@t.t").unwrap();
        let parents = repo
            .head()
            .ok()
            .and_then(|h| h.peel_to_commit().ok())
            .map(|c| vec![c])
            .unwrap_or_default();
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, subject, &tree, &parent_refs)
            .unwrap()
    }

    /// Writes the same `.git/rebase-merge` state `git` leaves behind when a rebase pauses.
    /// libgit2 reports `RepositoryState::RebaseMerge` from these files alone, which is exactly
    /// the plumbing `get_rebase_state` is built to read (see the module doc comment).
    fn write_paused_rebase(dir: &Path, onto: &str, todo: &str, done: &str, stopped: &str) {
        let seq = dir.join(".git/rebase-merge");
        fs::create_dir_all(&seq).unwrap();
        fs::write(seq.join("interactive"), "").unwrap();
        fs::write(seq.join("head-name"), "refs/heads/feature\n").unwrap();
        fs::write(seq.join("onto"), format!("{onto}\n")).unwrap();
        fs::write(seq.join("git-rebase-todo"), todo).unwrap();
        fs::write(seq.join("done"), done).unwrap();
        fs::write(seq.join("stopped-sha"), format!("{stopped}\n")).unwrap();
        fs::write(seq.join("msgnum"), "1\n").unwrap();
        fs::write(seq.join("end"), "2\n").unwrap();
    }

    #[test]
    fn reports_idle_without_a_rebase() {
        let (dir, repo) = init_repo("rebase-state-idle");
        commit(&repo, &dir, "a.txt", "base");
        let state = get_rebase_state(&repo).unwrap();
        assert_eq!(state.kind, "idle");
        assert!(state.steps.is_empty());
        assert_eq!(state.onto_oid, None);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn describes_a_paused_rebase_with_its_plan_and_base() {
        let (dir, repo) = init_repo("rebase-state-paused");
        let base = commit(&repo, &dir, "a.txt", "chore: base commit");
        // The branch the base is on gives `onto` a name, the way a real `rebase main` would.
        repo.branch("main", &repo.find_commit(base).unwrap(), true)
            .unwrap();
        let first = commit(&repo, &dir, "b.txt", "feat: first step");
        let second = commit(&repo, &dir, "c.txt", "feat: second step");

        write_paused_rebase(
            &dir,
            &base.to_string(),
            &format!("pick {second} # stale subject\n\n# help block\n"),
            &format!("pick {first} # stale subject\n"),
            &first.to_string(),
        );

        let state = get_rebase_state(&repo).unwrap();
        assert_eq!(state.kind, "conflict");
        assert_eq!(state.branch_name.as_deref(), Some("feature"));
        assert_eq!(state.current_step, Some(1));
        assert_eq!(state.total_steps, Some(2));

        // Base: named by the branch pointing at it, with its own subject.
        assert_eq!(state.onto_oid.as_deref(), Some(base.to_string().as_str()));
        assert_eq!(state.onto_label.as_deref(), Some("main"));
        assert_eq!(state.onto_subject.as_deref(), Some("chore: base commit"));
        assert_eq!(
            state.onto_short_oid.as_deref(),
            Some(&base.to_string()[..7])
        );

        // Plan: the paused step first (it's the last `done` line), then what's left.
        let steps = &state.steps;
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0].status, "current");
        assert_eq!(steps[0].subject.as_deref(), Some("feat: first step"));
        assert_eq!(steps[1].status, "pending");
        assert_eq!(steps[1].subject.as_deref(), Some("feat: second step"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn recognizes_an_edit_pause_from_the_last_done_line() {
        let (dir, repo) = init_repo("rebase-state-edit");
        let base = commit(&repo, &dir, "a.txt", "base");
        let first = commit(&repo, &dir, "b.txt", "feat: reworded step");

        write_paused_rebase(
            &dir,
            &base.to_string(),
            "",
            &format!("reword {first} # feat: reworded step\n"),
            &first.to_string(),
        );

        let state = get_rebase_state(&repo).unwrap();
        assert_eq!(state.kind, "edit_pause");
        assert_eq!(state.steps.len(), 1);
        assert_eq!(state.steps[0].action, "reword");
        assert_eq!(state.steps[0].status, "current");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn leaves_the_base_unnamed_when_no_branch_points_at_it() {
        let (dir, repo) = init_repo("rebase-state-unnamed-base");
        let base = commit(&repo, &dir, "a.txt", "chore: unnamed base");
        let first = commit(&repo, &dir, "b.txt", "feat: first");
        // Only the checked-out branch exists, and it's at `first` — so nothing names `base`.
        write_paused_rebase(
            &dir,
            &base.to_string(),
            "",
            &format!("pick {first} # feat: first\n"),
            &first.to_string(),
        );

        let state = get_rebase_state(&repo).unwrap();
        assert_eq!(state.onto_label, None);
        assert_eq!(state.onto_subject.as_deref(), Some("chore: unnamed base"));
        fs::remove_dir_all(&dir).ok();
    }
}
