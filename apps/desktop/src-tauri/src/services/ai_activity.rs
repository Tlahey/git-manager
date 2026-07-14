//! Git-activity gathering for the AI "daily summary" feature. Where `ai_context.rs` snapshots the
//! *uncommitted* changes for commit-writing features, this module looks *backwards*: it collects the
//! commits authored within a recent time window (what was done "yesterday") plus a light snapshot of
//! the still-uncommitted work (a hint for what could be planned "today"). Same division of labour as
//! the rest of the AI plumbing — the git2 logic lives here, while the instruction, prompt shape and
//! response parsing all live in `@git-manager/ai`; the backend never knows the context is for a
//! summary.

use crate::error::AppError;
use git2::{Delta, DiffOptions, Repository};
use serde::Serialize;
use std::path::Path;

/// Hard cap on the number of commits fed to the model, so an unusually busy window can't blow up the
/// prompt. Newest commits win — older ones beyond the cap are dropped.
const MAX_COMMITS: usize = 50;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCommit {
    pub short_oid: String,
    pub subject: String,
    /// The commit body (message minus the subject line), trimmed. Empty when the commit is
    /// subject-only.
    pub body: String,
    pub author: String,
    /// Author timestamp, seconds since the epoch — lets the frontend/model reason about ordering.
    pub timestamp: i64,
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingChange {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiActivity {
    pub repo_name: String,
    pub branch: String,
    /// Non-merge commits authored within the requested window, newest first (capped at
    /// [`MAX_COMMITS`]).
    pub commits: Vec<ActivityCommit>,
    /// A light snapshot of the uncommitted work (staged + unstaged + untracked), so the summary can
    /// suggest what's still in flight / what to plan next. May be empty on a clean tree.
    pub pending: Vec<PendingChange>,
    /// True when the window contained more non-merge commits than [`MAX_COMMITS`], so the frontend
    /// can note the summary is based on a sample.
    pub truncated: bool,
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

/// Computes `(files_changed, insertions, deletions)` for a commit versus its first parent (or the
/// empty tree for a root commit). Returns zeros if the diff can't be produced — stats are advisory.
fn commit_stats(repo: &Repository, commit: &git2::Commit) -> (usize, usize, usize) {
    let commit_tree = match commit.tree() {
        Ok(t) => t,
        Err(_) => return (0, 0, 0),
    };
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None);
    match diff.and_then(|d| d.stats()) {
        Ok(stats) => (stats.files_changed(), stats.insertions(), stats.deletions()),
        Err(_) => (0, 0, 0),
    }
}

/// Collects the uncommitted changes (worktree vs HEAD, untracked included) as a flat file list.
fn collect_pending(repo: &Repository) -> Vec<PendingChange> {
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut opts = DiffOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let Ok(diff) = repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts)) else {
        return Vec::new();
    };
    let mut pending = Vec::new();
    for delta in diff.deltas() {
        if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
            pending.push(PendingChange {
                path: path.to_string_lossy().to_string(),
                status: status_word(delta.status()).to_string(),
            });
        }
    }
    pending
}

/// Walks HEAD's history newest-first and gathers every non-merge commit whose author time is at or
/// after `since_epoch`, stopping once a commit falls before the cutoff (history is time-ordered, so
/// there's nothing newer past that point). Merge commits are skipped — their auto-generated subjects
/// don't describe authored work.
fn collect_commits(
    repo: &Repository,
    since_epoch: i64,
) -> Result<(Vec<ActivityCommit>, bool), AppError> {
    let mut revwalk = repo.revwalk().map_err(AppError::Git)?;
    revwalk
        .set_sorting(git2::Sort::TIME)
        .map_err(AppError::Git)?;
    if revwalk.push_head().is_err() {
        // No HEAD (unborn branch) — no history to summarize.
        return Ok((Vec::new(), false));
    }

    let mut commits = Vec::new();
    let mut truncated = false;
    for oid in revwalk {
        let Ok(oid) = oid else { continue };
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        // Author time drives "when the work was done"; a rebase can rewrite committer time later.
        if commit.author().when().seconds() < since_epoch {
            break;
        }
        if commit.parent_count() > 1 {
            continue;
        }
        if commits.len() >= MAX_COMMITS {
            truncated = true;
            break;
        }
        let raw_message = commit.message().unwrap_or("");
        let subject = raw_message.lines().next().unwrap_or("").trim().to_string();
        let body = raw_message
            .lines()
            .skip(2)
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
        let (files_changed, insertions, deletions) = commit_stats(repo, &commit);
        commits.push(ActivityCommit {
            short_oid: commit.id().to_string()[..7].to_string(),
            subject,
            body,
            author: commit.author().name().unwrap_or("").to_string(),
            timestamp: commit.author().when().seconds(),
            files_changed,
            insertions,
            deletions,
        });
    }
    Ok((commits, truncated))
}

/// Gathers the recent-activity context for the daily-summary feature: the non-merge commits authored
/// in the last `since_hours` hours plus the current uncommitted work. `since_hours` is provided by
/// the caller (which knows the local clock / weekend boundaries) so this stays a pure git query.
pub fn build_ai_activity(repo_path: &str, since_hours: i64) -> Result<AiActivity, AppError> {
    let repo =
        Repository::open(repo_path).map_err(|_| AppError::RepoNotFound(repo_path.to_string()))?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let since_epoch = now - since_hours.max(0) * 3600;

    let (commits, truncated) = collect_commits(&repo, since_epoch)?;
    let pending = collect_pending(&repo);

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".to_string());

    let repo_name = Path::new(repo_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| repo_path.to_string());

    Ok(AiActivity {
        repo_name,
        branch,
        commits,
        pending,
        truncated,
    })
}
