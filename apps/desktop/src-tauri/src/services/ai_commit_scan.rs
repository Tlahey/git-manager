//! The commit list the AI commit *search* reads, one commit at a time.
//!
//! Neighbour to `ai_activity.rs`, and deliberately not a widening of it: the daily summary wants a
//! short window's commits with their volume, and pays nothing for file paths it never shows. The
//! search wants the opposite — a month or more, every commit identified by its **full** oid so the
//! frontend can fetch that commit's patch on its own, and each commit's changed paths so the panel
//! can list what it is about to read before a single token has been generated.
//!
//! Same division of labour as the rest of the AI plumbing: the git2 query lives here, the question,
//! the prompt and the answer all live in `@git-manager/ai`. This module has never heard of the
//! question being asked.

use crate::error::AppError;
use git2::{Delta, Repository};
use serde::Serialize;
use std::path::Path;

/// Fallback cap on how many commits one scan returns, applied when the caller asks for none.
///
/// A cap has to exist at this layer and not only in the UI: each returned commit costs the frontend
/// a diff fetch and a model call, so an unbounded month on a busy repository is not a slow search,
/// it is one nobody will ever see finish. Newest commits win — `truncated` tells the panel it is
/// looking at a sample so it can say so instead of implying the window was fully read.
const DEFAULT_MAX_COMMITS: usize = 60;

/// Hard ceiling on the caller's `max_commits`, so a mistyped setting cannot turn one search into
/// thousands of model calls.
const MAX_COMMITS_CEILING: usize = 500;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanCommitFile {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanCommit {
    /// Full oid — what the frontend passes back to `get_commit_diff` to read this commit.
    pub oid: String,
    pub short_oid: String,
    pub subject: String,
    /// Message minus the subject line, trimmed. Empty for a subject-only commit.
    pub body: String,
    pub author: String,
    /// Author timestamp, seconds since the epoch.
    pub timestamp: i64,
    /// Every path this commit touched, with its status. Bounded by [`MAX_FILES_PER_COMMIT`] so a
    /// vendored-tree import can't make one commit dwarf the whole payload.
    pub files: Vec<ScanCommitFile>,
    /// True when this commit touched more paths than `files` lists.
    pub files_truncated: bool,
    pub insertions: usize,
    pub deletions: usize,
    /// Number of parents — >1 means a merge, whose diff is against the first parent.
    pub parent_count: usize,
}

/// Cap on the paths listed per commit. Well past what a reviewable commit touches; it exists for the
/// lockfile-regeneration or dependency-bump commit that touches thousands.
const MAX_FILES_PER_COMMIT: usize = 60;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCommitScan {
    pub repo_name: String,
    pub branch: String,
    /// Non-merge commits authored within the window, newest first.
    pub commits: Vec<ScanCommit>,
    /// True when the window held more commits than were returned, i.e. the answer will be based on
    /// the most recent slice rather than the whole window.
    pub truncated: bool,
    /// Author timestamp of the oldest commit actually returned, or `None` when none were.
    ///
    /// The span *read*, not the span *asked for*. Those used to differ silently: the caller asked
    /// for a month, the cap stopped the walk after ten commits, and the prompt still said "since
    /// <a month ago>" — telling the model that ten commits covered thirty days when they covered
    /// three.
    pub oldest_epoch: Option<i64>,
    /// Author timestamp of the newest commit returned, or `None` when none were.
    pub newest_epoch: Option<i64>,
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

/// Lists a commit's touched paths and its line counts, versus its first parent (the empty tree for a
/// root commit). Returns empty/zeroes when the diff can't be produced — the paths are context for a
/// prompt, not something worth failing a whole scan over.
fn commit_files(
    repo: &Repository,
    commit: &git2::Commit,
) -> (Vec<ScanCommitFile>, bool, usize, usize) {
    let Ok(commit_tree) = commit.tree() else {
        return (Vec::new(), false, 0, 0);
    };
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let Ok(diff) = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None) else {
        return (Vec::new(), false, 0, 0);
    };

    let mut files = Vec::new();
    let mut files_truncated = false;
    for delta in diff.deltas() {
        if files.len() >= MAX_FILES_PER_COMMIT {
            files_truncated = true;
            break;
        }
        if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
            files.push(ScanCommitFile {
                path: path.to_string_lossy().to_string(),
                status: status_word(delta.status()).to_string(),
            });
        }
    }

    let (insertions, deletions) = diff
        .stats()
        .map(|s| (s.insertions(), s.deletions()))
        .unwrap_or((0, 0));

    (files, files_truncated, insertions, deletions)
}

/// Walks HEAD newest-first and collects every non-merge commit authored at or after `since_epoch`,
/// stopping at the first one older than the cutoff — the walk is time-sorted, so nothing newer lies
/// beyond it.
///
/// Merge commits are skipped for the same reason the daily summary skips them: their generated
/// subject describes no authored work, and their first-parent diff restates changes the branch's own
/// commits already carry, which in a search would mean reporting the same change twice.
fn collect_commits(
    repo: &Repository,
    since_epoch: Option<i64>,
    max_commits: usize,
) -> Result<(Vec<ScanCommit>, bool), AppError> {
    let mut revwalk = repo.revwalk().map_err(AppError::Git)?;
    revwalk
        .set_sorting(git2::Sort::TIME)
        .map_err(AppError::Git)?;
    if revwalk.push_head().is_err() {
        // Unborn branch: no history to search.
        return Ok((Vec::new(), false));
    }

    let mut commits = Vec::new();
    let mut truncated = false;
    for oid in revwalk {
        let Ok(oid) = oid else { continue };
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        // Author time is when the work was done; a rebase rewrites committer time long after.
        if since_epoch.is_some_and(|since| commit.author().when().seconds() < since) {
            break;
        }
        if commit.parent_count() > 1 {
            continue;
        }
        if commits.len() >= max_commits {
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
        let (files, files_truncated, insertions, deletions) = commit_files(repo, &commit);

        commits.push(ScanCommit {
            oid: commit.id().to_string(),
            short_oid: commit.id().to_string()[..7].to_string(),
            subject,
            body,
            author: commit.author().name().unwrap_or("").to_string(),
            timestamp: commit.author().when().seconds(),
            files,
            files_truncated,
            insertions,
            deletions,
            parent_count: commit.parent_count(),
        });
    }
    Ok((commits, truncated))
}

/// Gathers the commits an AI search will read: the `max_commits` most recent non-merge commits,
/// optionally stopping at `since_hours` hours ago.
///
/// The time bound is optional because it is nearly always redundant. The walk stops at whichever
/// limit it meets first, so exactly one of the two ever binds — and since every returned commit
/// costs the caller a model call, the count is the one that *must*. A window can therefore only ever
/// make the result smaller than the count asked for, which is a rarely wanted effect and was the
/// source of a "the period held more commits than were read" warning that fired precisely when the
/// window had done nothing. `None` means "just give me the newest N".
pub fn build_ai_commit_scan(
    repo_path: &str,
    since_hours: Option<i64>,
    max_commits: Option<usize>,
) -> Result<AiCommitScan, AppError> {
    let repo =
        Repository::open(repo_path).map_err(|_| AppError::RepoNotFound(repo_path.to_string()))?;

    let since_epoch = since_hours.map(|hours| {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        now - hours.max(0) * 3600
    });

    let cap = max_commits
        .unwrap_or(DEFAULT_MAX_COMMITS)
        .clamp(1, MAX_COMMITS_CEILING);
    let (commits, truncated) = collect_commits(&repo, since_epoch, cap)?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".to_string());

    let repo_name = Path::new(repo_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| repo_path.to_string());

    let newest_epoch = commits.first().map(|c| c.timestamp);
    let oldest_epoch = commits.last().map(|c| c.timestamp);

    Ok(AiCommitScan {
        repo_name,
        branch,
        commits,
        truncated,
        oldest_epoch,
        newest_epoch,
    })
}
