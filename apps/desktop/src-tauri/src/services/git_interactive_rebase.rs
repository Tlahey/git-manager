//! Interactive rebase driven by a UI-built todo list.
//!
//! Like `run_autosquash`, execution shells out to `git rebase -i` (libgit2's
//! rebase backend doesn't match git's interactive one — see `git_rebase`); the
//! todo is injected via `GIT_SEQUENCE_EDITOR`. Custom reword/squash messages are
//! applied with `exec git commit --amend -F <file>` lines so git's message
//! editor never has to be scripted.

use crate::error::AppError;
use crate::models::GitCommit;
use crate::utils::commit_to_model;
use git2::{Oid, Repository};
use serde::Deserialize;
use std::path::{Path, PathBuf};

/// One row of the "Rebasing Commit" editor, in rebase order (oldest first).
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RebaseTodoStep {
    /// `pick` | `reword` | `squash` | `fixup` | `drop`
    pub action: String,
    pub oid: String,
    /// Replacement commit message (reword, or custom squash result message).
    pub message: Option<String>,
}

/// Commits from `base_oid` (inclusive) up to HEAD, oldest first — the rows of
/// the "Rebasing Commit" editor. Errors if `base_oid` isn't reachable from HEAD.
pub fn list_rebase_commits(repo: &Repository, base_oid: &str) -> Result<Vec<GitCommit>, AppError> {
    let base = Oid::from_str(base_oid)
        .map_err(|_| AppError::Unknown(format!("Invalid OID: {base_oid}")))?;

    let mut walk = repo.revwalk().map_err(AppError::Git)?;
    walk.push_head().map_err(AppError::Git)?;
    walk.set_sorting(git2::Sort::TOPOLOGICAL)
        .map_err(AppError::Git)?;

    let mut commits = Vec::new();
    let mut found_base = false;
    for oid_result in walk {
        let oid = oid_result.map_err(AppError::Git)?;
        let commit = repo.find_commit(oid).map_err(AppError::Git)?;
        commits.push(commit_to_model(&commit));
        if oid == base {
            found_base = true;
            break;
        }
    }

    if !found_base {
        return Err(AppError::Unknown(format!(
            "Commit {base_oid} is not an ancestor of HEAD"
        )));
    }

    commits.reverse();
    Ok(commits)
}

/// Renders the todo list content for `git rebase -i`, writing any custom
/// messages as sidecar files in `dir` referenced by `exec git commit --amend -F`
/// lines. Returns the todo text. Pure string generation — testable without git.
pub fn render_todo(steps: &[RebaseTodoStep], dir: &Path) -> Result<String, AppError> {
    if steps.is_empty() {
        return Err(AppError::Unknown("Empty rebase todo".to_string()));
    }
    // git rejects a squash/fixup with no preceding picked commit.
    if matches!(steps[0].action.as_str(), "squash" | "fixup") {
        return Err(AppError::Unknown(
            "The first rebase step cannot be a squash/fixup".to_string(),
        ));
    }

    let mut todo = String::new();
    let mut msg_index = 0usize;

    for step in steps {
        match step.action.as_str() {
            "drop" => {
                todo.push_str(&format!("drop {}\n", step.oid));
            }
            // A reword is a pick whose message gets amended right after; plain
            // picks may also carry an amended message (kept permissive).
            "pick" | "reword" | "squash" | "fixup" => {
                let action = if step.action == "reword" {
                    "pick"
                } else {
                    &step.action
                };
                todo.push_str(&format!("{action} {}\n", step.oid));

                if let Some(message) = step
                    .message
                    .as_deref()
                    .map(str::trim)
                    .filter(|m| !m.is_empty())
                {
                    let msg_path = dir.join(format!("rebase-msg-{msg_index}.txt"));
                    msg_index += 1;
                    std::fs::write(&msg_path, format!("{message}\n"))
                        .map_err(|e| AppError::Unknown(e.to_string()))?;
                    todo.push_str(&format!(
                        "exec git commit --amend -F \"{}\"\n",
                        msg_path.display()
                    ));
                }
            }
            other => {
                return Err(AppError::Unknown(format!("Unknown rebase action: {other}")));
            }
        }
    }

    Ok(todo)
}

/// Writes the rendered todo into `dir` and returns its path.
pub fn write_todo(steps: &[RebaseTodoStep], dir: &Path) -> Result<PathBuf, AppError> {
    let todo = render_todo(steps, dir)?;
    let todo_path = dir.join("rebase-todo.txt");
    std::fs::write(&todo_path, todo).map_err(|e| AppError::Unknown(e.to_string()))?;
    Ok(todo_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(action: &str, oid: &str, message: Option<&str>) -> RebaseTodoStep {
        RebaseTodoStep {
            action: action.to_string(),
            oid: oid.to_string(),
            message: message.map(String::from),
        }
    }

    #[test]
    fn renders_plain_picks_and_drop() {
        let dir = std::env::temp_dir();
        let todo = render_todo(
            &[
                step("pick", "aaa", None),
                step("drop", "bbb", None),
                step("pick", "ccc", None),
            ],
            &dir,
        )
        .unwrap();
        assert_eq!(todo, "pick aaa\ndrop bbb\npick ccc\n");
    }

    #[test]
    fn reword_becomes_pick_plus_exec_amend() {
        let dir = std::env::temp_dir().join(format!("gm-test-reword-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let todo = render_todo(&[step("reword", "aaa", Some("new subject"))], &dir).unwrap();
        assert!(todo.starts_with("pick aaa\nexec git commit --amend -F "));
        let msg_file = dir.join("rebase-msg-0.txt");
        assert_eq!(std::fs::read_to_string(msg_file).unwrap(), "new subject\n");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn fixup_keeps_action_and_squash_message_amends() {
        let dir = std::env::temp_dir().join(format!("gm-test-squash-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let todo = render_todo(
            &[
                step("pick", "aaa", None),
                step("fixup", "bbb", None),
                step("squash", "ccc", Some("combined")),
            ],
            &dir,
        )
        .unwrap();
        assert!(todo.contains("fixup bbb\n"));
        assert!(todo.contains("squash ccc\nexec git commit --amend -F "));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rejects_leading_squash_and_unknown_actions() {
        let dir = std::env::temp_dir();
        assert!(render_todo(&[step("fixup", "aaa", None)], &dir).is_err());
        assert!(render_todo(
            &[step("pick", "aaa", None), step("edit", "bbb", None)],
            &dir
        )
        .is_err());
        assert!(render_todo(&[], &dir).is_err());
    }
}
