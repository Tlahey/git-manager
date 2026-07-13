//! Line-level blame and per-file commit history.
//!
//! `blame_file` wraps `git2::Blame` to return, for each contiguous run of lines attributed to the
//! same commit, who last touched it and the commit's message. `file_history` is the equivalent of
//! `git log -- <path>`: it walks history from HEAD and keeps commits whose tree differs from their
//! first parent for that path (first-parent "simplified history", which is what most file-history
//! UIs show). Both are consumed by the diff viewer's Blame/History panels.

use crate::error::AppError;
use crate::utils::short_oid;
use git2::{BlameOptions, Delta, DiffOptions, Oid, Repository, Sort};
use serde::Serialize;
use std::path::Path;

/// One contiguous run of lines in a file attributed to a single commit.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BlameHunk {
    /// 1-based line number of the first line of the run in the blamed file.
    pub start_line: usize,
    pub line_count: usize,
    pub commit_oid: String,
    pub short_oid: String,
    pub author_name: String,
    pub author_email: String,
    /// Author time, Unix epoch seconds.
    pub timestamp: i64,
    pub summary: String,
    pub body: String,
}

/// A commit that modified a given file, in reverse-chronological order.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileHistoryEntry {
    pub oid: String,
    pub short_oid: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub summary: String,
    pub body: String,
    /// How the file changed in this commit: `added` | `modified` | `deleted` | `renamed`.
    pub status: String,
}

/// Maps a git2 diff `Delta` status to the string the frontend expects for a history entry.
fn delta_status_label(status: Delta) -> &'static str {
    match status {
        Delta::Added | Delta::Copied | Delta::Untracked => "added",
        Delta::Deleted => "deleted",
        Delta::Renamed => "renamed",
        _ => "modified",
    }
}

/// Splits a commit's raw message into `(summary, body)` the same way `utils::commit_to_model` does:
/// first line is the summary, everything after the blank separator line is the body.
fn summary_and_body(message: &str) -> (String, String) {
    let summary = message.lines().next().unwrap_or("").to_string();
    let body = message.lines().skip(2).collect::<Vec<_>>().join("\n");
    (summary, body)
}

/// Blames `file_path` at `at_oid` (or HEAD when `None`), collapsing Monaco-friendly per-line data
/// into contiguous same-commit runs.
pub fn blame_file(
    repo: &Repository,
    file_path: &str,
    at_oid: Option<&str>,
) -> Result<Vec<BlameHunk>, AppError> {
    let mut opts = BlameOptions::new();
    if let Some(oid) = at_oid {
        let oid = Oid::from_str(oid).map_err(AppError::Git)?;
        opts.newest_commit(oid);
    }

    let blame = repo
        .blame_file(Path::new(file_path), Some(&mut opts))
        .map_err(AppError::Git)?;

    let mut hunks = Vec::new();
    for hunk in blame.iter() {
        let start_line = hunk.final_start_line();
        let line_count = hunk.lines_in_hunk();
        if line_count == 0 {
            continue;
        }
        let commit_oid = hunk.final_commit_id();
        let oid_str = commit_oid.to_string();

        let (author_name, author_email, timestamp, summary, body) =
            match repo.find_commit(commit_oid) {
                Ok(commit) => {
                    let author = commit.author();
                    let (summary, body) = summary_and_body(commit.message().unwrap_or(""));
                    (
                        author.name().unwrap_or("").to_string(),
                        author.email().unwrap_or("").to_string(),
                        author.when().seconds(),
                        summary,
                        body,
                    )
                }
                Err(_) => {
                    // Boundary/uncommitted lines: fall back to the hunk's own signature.
                    let sig = hunk.final_signature();
                    (
                        sig.name().unwrap_or("").to_string(),
                        sig.email().unwrap_or("").to_string(),
                        sig.when().seconds(),
                        String::new(),
                        String::new(),
                    )
                }
            };

        hunks.push(BlameHunk {
            start_line,
            line_count,
            short_oid: short_oid(&oid_str),
            commit_oid: oid_str,
            author_name,
            author_email,
            timestamp,
            summary,
            body,
        });
    }

    Ok(hunks)
}

/// Returns commits that changed `file_path`, newest first, capped at `limit` (default 200).
/// Uses first-parent "simplified history" — a commit is kept when its tree differs from its first
/// parent's for that path (or, for the root commit, when the path exists).
pub fn file_history(
    repo: &Repository,
    file_path: &str,
    limit: Option<usize>,
) -> Result<Vec<FileHistoryEntry>, AppError> {
    let limit = limit.unwrap_or(200);
    let path = Path::new(file_path);

    let mut revwalk = repo.revwalk().map_err(AppError::Git)?;
    revwalk
        .set_sorting(Sort::TOPOLOGICAL | Sort::TIME)
        .map_err(AppError::Git)?;
    revwalk.push_head().map_err(AppError::Git)?;

    let mut entries = Vec::new();
    for oid in revwalk {
        let oid = match oid {
            Ok(o) => o,
            Err(_) => continue,
        };
        let commit = match repo.find_commit(oid) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let tree = match commit.tree() {
            Ok(t) => t,
            Err(_) => continue,
        };

        // Skip merge commits: they clutter file history without representing a real edit to the
        // file, and first-parent simplification already covers the changes they bring in.
        if commit.parent_count() > 1 {
            continue;
        }

        // Determine how (if at all) the file changed in this commit vs its first parent.
        let status: Option<&str> = if commit.parent_count() == 0 {
            tree.get_path(path).is_ok().then_some("added")
        } else if let Ok(parent) = commit.parent(0) {
            if let Ok(parent_tree) = parent.tree() {
                let mut opts = DiffOptions::new();
                opts.pathspec(file_path);
                repo.diff_tree_to_tree(Some(&parent_tree), Some(&tree), Some(&mut opts))
                    .ok()
                    .and_then(|d| {
                        d.deltas()
                            .next()
                            .map(|delta| delta_status_label(delta.status()))
                    })
            } else {
                None
            }
        } else {
            None
        };

        if let Some(status) = status {
            let author = commit.author();
            let (summary, body) = summary_and_body(commit.message().unwrap_or(""));
            let oid_str = oid.to_string();
            entries.push(FileHistoryEntry {
                short_oid: short_oid(&oid_str),
                oid: oid_str,
                author_name: author.name().unwrap_or("").to_string(),
                author_email: author.email().unwrap_or("").to_string(),
                timestamp: author.when().seconds(),
                summary,
                body,
                status: status.to_string(),
            });
            if entries.len() >= limit {
                break;
            }
        }
    }

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::{delta_status_label, summary_and_body};
    use git2::Delta;

    #[test]
    fn maps_delta_statuses() {
        assert_eq!(delta_status_label(Delta::Added), "added");
        assert_eq!(delta_status_label(Delta::Copied), "added");
        assert_eq!(delta_status_label(Delta::Deleted), "deleted");
        assert_eq!(delta_status_label(Delta::Renamed), "renamed");
        assert_eq!(delta_status_label(Delta::Modified), "modified");
        assert_eq!(delta_status_label(Delta::Typechange), "modified");
    }

    #[test]
    fn summary_only() {
        let (summary, body) = summary_and_body("Fix the bug");
        assert_eq!(summary, "Fix the bug");
        assert_eq!(body, "");
    }

    #[test]
    fn summary_and_multiline_body() {
        let (summary, body) = summary_and_body("feat: add blame\n\nDetails line 1\nDetails line 2");
        assert_eq!(summary, "feat: add blame");
        assert_eq!(body, "Details line 1\nDetails line 2");
    }

    #[test]
    fn empty_message() {
        let (summary, body) = summary_and_body("");
        assert_eq!(summary, "");
        assert_eq!(body, "");
    }
}
