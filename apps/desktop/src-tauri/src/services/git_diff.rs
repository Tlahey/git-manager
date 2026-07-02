use crate::models::{GitDiff, GitDiffFile, GitDiffHunk, GitDiffLine};
use std::cell::RefCell;

/// Walks a `git2::Diff` and appends one `GitDiffFile` (with hunks/lines) per delta into `files`.
///
/// `force_untracked_status` reports every file's status as `"untracked"` regardless of its
/// actual `git2::Delta` status — used when diffing a stash's untracked-files tree, where the
/// delta status (e.g. "added") doesn't reflect what the user should see ("untracked").
pub fn diff_foreach_files(
    diff: &git2::Diff,
    files: &RefCell<Vec<GitDiffFile>>,
    force_untracked_status: bool,
) -> Result<(), git2::Error> {
    diff.foreach(
        &mut |delta, _progress| {
            let old_path = delta
                .old_file()
                .path()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();
            let new_path = delta
                .new_file()
                .path()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();
            let status = if force_untracked_status {
                "untracked"
            } else {
                match delta.status() {
                    git2::Delta::Added => "added",
                    git2::Delta::Deleted => "deleted",
                    git2::Delta::Modified => "modified",
                    git2::Delta::Renamed => "renamed",
                    git2::Delta::Copied => "copied",
                    git2::Delta::Typechange => "typechange",
                    _ => "modified",
                }
            };
            let is_binary = delta.old_file().is_binary() || delta.new_file().is_binary();

            files.borrow_mut().push(GitDiffFile {
                old_path,
                new_path,
                status: status.to_string(),
                additions: 0,
                deletions: 0,
                hunks: Vec::new(),
                is_binary,
            });
            true
        },
        None,
        Some(&mut |_delta, hunk| {
            let header = std::str::from_utf8(hunk.header())
                .unwrap_or("")
                .trim_end_matches('\n')
                .to_string();
            if let Some(file) = files.borrow_mut().last_mut() {
                file.hunks.push(GitDiffHunk {
                    header,
                    lines: Vec::new(),
                });
            }
            true
        }),
        Some(&mut |_delta, _hunk, line| {
            let content = std::str::from_utf8(line.content())
                .unwrap_or("")
                .trim_end_matches('\n')
                .to_string();
            let origin = match line.origin() {
                '+' => "+",
                '-' => "-",
                ' ' => " ",
                _ => "\\",
            };
            let mut f = files.borrow_mut();
            if let Some(file) = f.last_mut() {
                match origin {
                    "+" => file.additions += 1,
                    "-" => file.deletions += 1,
                    _ => {}
                }
                if let Some(hunk) = file.hunks.last_mut() {
                    hunk.lines.push(GitDiffLine {
                        origin: origin.to_string(),
                        content,
                        old_lineno: line.old_lineno().map(|n| n as i32),
                        new_lineno: line.new_lineno().map(|n| n as i32),
                    });
                }
            }
            true
        }),
    )
}

/// Aggregates a list of `GitDiffFile` into a `GitDiff` (totals summed across files).
pub fn finalize(files: Vec<GitDiffFile>) -> GitDiff {
    let total_additions = files.iter().map(|f| f.additions).sum();
    let total_deletions = files.iter().map(|f| f.deletions).sum();
    GitDiff {
        files,
        total_additions,
        total_deletions,
    }
}

/// Builds a complete `GitDiff` from a single `git2::Diff` (the common case — no untracked-files
/// merge needed).
pub fn build_diff(diff: git2::Diff) -> Result<GitDiff, git2::Error> {
    let files: RefCell<Vec<GitDiffFile>> = RefCell::new(Vec::new());
    diff_foreach_files(&diff, &files, false)?;
    Ok(finalize(files.into_inner()))
}
