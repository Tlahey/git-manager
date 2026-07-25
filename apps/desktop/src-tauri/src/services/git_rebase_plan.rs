//! Reconstructs the *full* todo list of a running rebase — the plan behind the progress
//! counters `git_rebase` reports in `RebaseState`.
//!
//! Same rationale as `git_rebase`: libgit2 can't describe git's interactive/merge backend,
//! so this parses the on-disk sequencer files directly.
//!
//! - `.git/rebase-merge/done` — the commands already executed, oldest first. The command
//!   that *paused* the rebase is the last line here (git appends it before running it),
//!   which is why the last done line is the "current" step and not a finished one.
//! - `.git/rebase-merge/git-rebase-todo` — the commands still to run, oldest first. It also
//!   holds blank lines and `#` comment lines (git re-writes its help block into the file),
//!   which are skipped.
//!
//! Concatenating the two gives the plan in execution order, and the boundary between them is
//! where the rebase currently sits.

use crate::models::RebaseProgressStep;
use crate::utils::short_oid;
use git2::Repository;
use std::fs;
use std::path::{Path, PathBuf};

/// Todo commands that operate on a commit, i.e. whose second token is an object id — both
/// the long and the single-letter forms git accepts.
const COMMIT_ACTIONS: &[&str] = &[
    "pick", "p", "reword", "r", "edit", "e", "squash", "s", "fixup", "f", "drop", "d",
];

/// Builds the ordered step list of the rebase in progress under `git_dir`.
///
/// `paused` tells whether the rebase is stopped on its current command (a conflict or an
/// edit/reword pause): only then does the last `done` line describe a step the user still has
/// to act on. While git is mid-apply, every done line is genuinely finished.
///
/// Returns an empty vec when there's no sequencer directory to read (nothing to describe).
pub fn read_rebase_steps(
    repo: &Repository,
    git_dir: &Path,
    paused: bool,
) -> Vec<RebaseProgressStep> {
    let Some(dir) = sequencer_dir(git_dir) else {
        return Vec::new();
    };

    let done = read_lines(&dir.join("done"));
    let todo = read_lines(&dir.join("git-rebase-todo"));

    // The step the rebase sits on: the last executed command, but only while paused on it.
    let current_index = if paused && !done.is_empty() {
        Some(done.len() - 1)
    } else {
        None
    };
    let done_count = done.len();

    done.into_iter()
        .chain(todo)
        .enumerate()
        .filter_map(|(i, line)| {
            let status = if Some(i) == current_index {
                "current"
            } else if i < done_count {
                "done"
            } else {
                "pending"
            };
            parse_step(repo, &line, i + 1, status)
        })
        .collect()
}

/// `.git/rebase-merge` (interactive/merge backend). The older am backend (`rebase-apply`)
/// keeps no todo/done files, so it can't describe a plan — only step counters.
fn sequencer_dir(git_dir: &Path) -> Option<PathBuf> {
    let merge_dir = git_dir.join("rebase-merge");
    merge_dir.is_dir().then_some(merge_dir)
}

/// Non-empty, non-comment lines of a sequencer file, in order.
fn read_lines(path: &Path) -> Vec<String> {
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_string)
        .collect()
}

/// Parses one todo line into a step. `None` for a line with no command at all.
///
/// Commit lines look like `pick <oid> # <subject>` (git ≥ 2.4x) or `pick <oid> <subject>`;
/// the object id is resolved so the subject and short oid come from the commit itself rather
/// than from whatever `rebase.instructionFormat` happened to render. Non-commit commands
/// (`exec`, `break`, `label`, `reset`, `merge`, `update-ref`) keep their argument text as the
/// subject — there's no commit to resolve.
fn parse_step(
    repo: &Repository,
    line: &str,
    index: usize,
    status: &str,
) -> Option<RebaseProgressStep> {
    let mut tokens = line.split_whitespace();
    let action = tokens.next()?;
    let rest = line[action.len()..].trim();

    if !COMMIT_ACTIONS.contains(&action) {
        return Some(RebaseProgressStep {
            index,
            action: normalize_action(action),
            oid: None,
            short_oid: None,
            subject: clean_subject(rest),
            status: status.to_string(),
        });
    }

    let raw_oid = tokens.next().unwrap_or_default();
    let inline_subject = clean_subject(rest[raw_oid.len()..].trim());
    // The todo may hold an abbreviated id, and a commit can also be gone (a rebuilt fixture,
    // pruned objects) — in which case the id and subject git wrote in the file are all we have.
    let resolved = resolve_commit_oid(repo, raw_oid);
    let oid = resolved.or_else(|| (!raw_oid.is_empty()).then(|| raw_oid.to_string()));

    Some(RebaseProgressStep {
        index,
        action: normalize_action(action),
        short_oid: oid.as_deref().map(short_oid),
        subject: oid
            .as_deref()
            .and_then(|o| commit_summary(repo, o))
            .or(inline_subject),
        oid,
        status: status.to_string(),
    })
}

/// Full object id of the commit `rev` names (accepting an abbreviated id), if it still exists.
fn resolve_commit_oid(repo: &Repository, rev: &str) -> Option<String> {
    if rev.is_empty() {
        return None;
    }
    repo.revparse_single(rev)
        .ok()?
        .into_commit()
        .ok()
        .map(|commit| commit.id().to_string())
}

fn commit_summary(repo: &Repository, oid: &str) -> Option<String> {
    let oid = git2::Oid::from_str(oid).ok()?;
    repo.find_commit(oid)
        .ok()?
        .summary()
        .map(str::trim)
        .filter(|summary| !summary.is_empty())
        .map(str::to_string)
}

/// Expands git's single-letter todo commands so the UI has one label per action.
fn normalize_action(action: &str) -> String {
    match action {
        "p" => "pick",
        "r" => "reword",
        "e" => "edit",
        "s" => "squash",
        "f" => "fixup",
        "d" => "drop",
        "x" => "exec",
        "b" => "break",
        "l" => "label",
        "t" => "reset",
        "m" => "merge",
        other => other,
    }
    .to_string()
}

/// Drops the `# ` git puts between the object id and the subject in a todo line.
fn clean_subject(text: &str) -> Option<String> {
    let cleaned = text.trim_start_matches('#').trim();
    (!cleaned.is_empty()).then(|| cleaned.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Fresh repository with no objects at all, so commit lookups fail and these tests
    /// exercise the text parsing plus the fallback to the subject git wrote itself.
    fn init_repo(name: &str) -> (PathBuf, Repository) {
        let dir = std::env::temp_dir().join(format!("gm-test-{}-{}", name, std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    /// Writes a sequencer state (`done` + `git-rebase-todo`) and returns its `.git` dir.
    fn write_sequencer(dir: &Path, done: &str, todo: &str) -> PathBuf {
        let git_dir = dir.join(".git");
        let seq = git_dir.join("rebase-merge");
        fs::create_dir_all(&seq).unwrap();
        fs::write(seq.join("done"), done).unwrap();
        fs::write(seq.join("git-rebase-todo"), todo).unwrap();
        git_dir
    }

    #[test]
    fn splits_done_and_todo_around_the_current_step() {
        let (dir, repo) = init_repo("rebase-plan-split");
        let git_dir = write_sequencer(
            &dir,
            "pick aaaaaaa # first\npick bbbbbbb # second\n",
            "pick ccccccc # third\n\n# Rebase help block\n",
        );

        let steps = read_rebase_steps(&repo, &git_dir, true);
        let statuses: Vec<&str> = steps.iter().map(|s| s.status.as_str()).collect();
        assert_eq!(statuses, ["done", "current", "pending"]);
        let subjects: Vec<Option<&str>> = steps.iter().map(|s| s.subject.as_deref()).collect();
        assert_eq!(subjects, [Some("first"), Some("second"), Some("third")]);
        assert_eq!(steps[2].index, 3);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn marks_every_done_step_finished_when_not_paused() {
        let (dir, repo) = init_repo("rebase-plan-running");
        let git_dir = write_sequencer(&dir, "pick aaaaaaa # first\n", "pick bbbbbbb # second\n");

        let steps = read_rebase_steps(&repo, &git_dir, false);
        let statuses: Vec<&str> = steps.iter().map(|s| s.status.as_str()).collect();
        assert_eq!(statuses, ["done", "pending"]);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn expands_short_actions_and_keeps_exec_arguments() {
        let (dir, repo) = init_repo("rebase-plan-actions");
        let git_dir = write_sequencer(
            &dir,
            "",
            "s ddddddd # squashed\nx cargo test --all\nbreak\n",
        );

        let steps = read_rebase_steps(&repo, &git_dir, true);
        assert_eq!(steps[0].action, "squash");
        assert_eq!(steps[0].short_oid.as_deref(), Some("ddddddd"));
        assert_eq!(steps[0].subject.as_deref(), Some("squashed"));
        assert_eq!(steps[1].action, "exec");
        assert_eq!(steps[1].oid, None);
        assert_eq!(steps[1].subject.as_deref(), Some("cargo test --all"));
        assert_eq!(steps[2].action, "break");
        assert_eq!(steps[2].subject, None);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn resolves_subject_and_full_oid_from_the_repository() {
        let (dir, repo) = init_repo("rebase-plan-resolve");
        fs::write(dir.join("a.txt"), "a").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("a.txt")).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        let sig = git2::Signature::now("T", "t@t.t").unwrap();
        let oid = repo
            .commit(Some("HEAD"), &sig, &sig, "feat: real subject", &tree, &[])
            .unwrap()
            .to_string();

        // Abbreviated id + a stale subject in the file: the commit wins on both counts.
        let git_dir = write_sequencer(&dir, "", &format!("pick {} # stale text\n", &oid[..7]));
        let steps = read_rebase_steps(&repo, &git_dir, false);
        assert_eq!(steps[0].oid.as_deref(), Some(oid.as_str()));
        assert_eq!(steps[0].subject.as_deref(), Some("feat: real subject"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn yields_nothing_without_a_sequencer_directory() {
        let (dir, repo) = init_repo("rebase-plan-idle");
        assert!(read_rebase_steps(&repo, &dir.join(".git"), true).is_empty());
        fs::remove_dir_all(&dir).ok();
    }
}
