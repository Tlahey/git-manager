//! Git-context gathering for AI features. This is the one piece of AI plumbing that genuinely
//! belongs in Rust: it uses `git2` to snapshot the repo's uncommitted changes (diff text + the
//! list of changed files with their statuses) so a feature in `@git-manager/ai` can build its
//! prompt from it. Everything downstream — instruction, temperature, prompt shape, response
//! parsing — lives in the TS package; the backend never knows which feature the context is for.

use crate::error::AppError;
use crate::services::ai_convention::{detect_commit_convention, CommitConvention};
use git2::{Delta, DiffOptions, Repository};
use serde::Serialize;
use std::path::Path;

/// Which uncommitted state to snapshot. Mirrors `AiContextScope` in `packages/ai`.
#[derive(Debug, Clone, Copy)]
pub enum AiContextScope {
    /// Index vs HEAD — what a plain commit would capture.
    Staged,
    /// Worktree vs HEAD (staged + unstaged + untracked) — everything uncommitted, for grouping.
    Working,
}

impl AiContextScope {
    pub fn from_str(s: &str) -> Self {
        match s {
            "working" => AiContextScope::Working,
            _ => AiContextScope::Staged,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiContextFile {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiContext {
    pub diff: String,
    pub repo_name: String,
    pub branch: String,
    pub files: Vec<AiContextFile>,
    /// The project's own commit convention (commitlint config / git template), when it has one, so
    /// features can instruct the model to follow it. `None` when the repo defines no convention.
    pub commit_convention: Option<CommitConvention>,
    /// Subjects of the last few non-merge commits, newest first — a sample of how this project
    /// actually writes commit messages (its real convention may be enforced at the PR level, not
    /// via commitlint), so features can tell the model to match that style.
    pub recent_commits: Vec<String>,
}

/// Collects the subject lines of up to `limit` recent non-merge commits, newest first. Merge
/// commits (>1 parent) are skipped because their auto-generated subjects don't reflect the
/// project's authored style.
fn collect_recent_commit_subjects(repo: &Repository, limit: usize) -> Vec<String> {
    let mut subjects = Vec::new();
    let Ok(mut revwalk) = repo.revwalk() else {
        return subjects;
    };
    if revwalk.push_head().is_err() {
        return subjects;
    }
    for oid in revwalk {
        if subjects.len() >= limit {
            break;
        }
        let Ok(oid) = oid else { continue };
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        if commit.parent_count() > 1 {
            continue;
        }
        if let Some(summary) = commit.summary() {
            let trimmed = summary.trim();
            if !trimmed.is_empty() {
                subjects.push(trimmed.to_string());
            }
        }
    }
    subjects
}

fn status_word(delta: Delta) -> &'static str {
    match delta {
        Delta::Added => "added",
        Delta::Deleted => "deleted",
        Delta::Modified => "modified",
        Delta::Renamed => "renamed",
        Delta::Copied => "copied",
        Delta::Untracked => "untracked",
        Delta::Typechange => "typechange",
        _ => "modified",
    }
}

/// Opens the repo once and gathers everything a feature's prompt might need: the diff for the
/// requested `scope` as plain patch text, the repo's directory name, the current branch's short
/// name, and the changed files with their statuses.
pub fn build_ai_context(repo_path: &str, scope: AiContextScope) -> Result<AiContext, AppError> {
    let repo =
        Repository::open(repo_path).map_err(|_| AppError::RepoNotFound(repo_path.to_string()))?;

    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());

    let diff = match scope {
        AiContextScope::Staged => {
            let mut index = repo.index().map_err(AppError::Git)?;
            let index_tree = index
                .write_tree()
                .and_then(|oid| repo.find_tree(oid))
                .map_err(AppError::Git)?;
            repo.diff_tree_to_tree(head_tree.as_ref(), Some(&index_tree), None)
                .map_err(AppError::Git)?
        }
        AiContextScope::Working => {
            let mut opts = DiffOptions::new();
            opts.include_untracked(true).recurse_untracked_dirs(true);
            repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))
                .map_err(AppError::Git)?
        }
    };

    let mut files = Vec::new();
    for delta in diff.deltas() {
        if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
            files.push(AiContextFile {
                path: path.to_string_lossy().to_string(),
                status: status_word(delta.status()).to_string(),
            });
        }
    }

    let mut diff_text = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' => "+",
            '-' => "-",
            _ => " ",
        };
        diff_text.push_str(prefix);
        if let Ok(content) = std::str::from_utf8(line.content()) {
            diff_text.push_str(content);
        }
        true
    })
    .map_err(AppError::Git)?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".to_string());

    let repo_name = Path::new(repo_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| repo_path.to_string());

    let commit_convention = detect_commit_convention(repo_path, &repo);
    let recent_commits = collect_recent_commit_subjects(&repo, 10);

    Ok(AiContext {
        diff: diff_text,
        repo_name,
        branch,
        files,
        commit_convention,
        recent_commits,
    })
}
