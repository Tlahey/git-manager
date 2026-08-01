use crate::error::AppError;
use crate::models::{GitDiff, GitDiffFile, GitDiffHunk, GitDiffLine};
use git2::{DiffOptions, Oid, Repository};
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

/// Resolves the "before" tree for a commit range: the first-parent tree of `commit` (the repo
/// state just before it), or `None` when `commit` is a root commit (no parent).
fn first_parent_tree<'r>(commit: &git2::Commit<'r>) -> Result<Option<git2::Tree<'r>>, AppError> {
    if commit.parent_count() > 0 {
        let parent = commit.parent(0).map_err(AppError::Git)?;
        Ok(Some(parent.tree().map_err(AppError::Git)?))
    } else {
        Ok(None)
    }
}

/// Diffs the cumulative "merged" range spanning a multi-commit selection: the first-parent tree of
/// `base_oid` (the oldest selected commit — i.e. the state *before* it) against `head_oid`'s own
/// tree (the newest selected commit). Equivalent to `git diff base_oid^..head_oid`, this is the
/// combined change set surfaced when several commits are selected together in the graph.
pub fn merged_commits_diff(
    repo: &Repository,
    base_oid: &str,
    head_oid: &str,
) -> Result<GitDiff, AppError> {
    let base_commit = repo
        .find_commit(Oid::from_str(base_oid).map_err(AppError::Git)?)
        .map_err(AppError::Git)?;
    let head_commit = repo
        .find_commit(Oid::from_str(head_oid).map_err(AppError::Git)?)
        .map_err(AppError::Git)?;

    let base_tree = first_parent_tree(&base_commit)?;
    let head_tree = head_commit.tree().map_err(AppError::Git)?;

    let mut diff_opts = DiffOptions::new();
    diff_opts.context_lines(3).ignore_whitespace_change(false);

    let diff = repo
        .diff_tree_to_tree(base_tree.as_ref(), Some(&head_tree), Some(&mut diff_opts))
        .map_err(AppError::Git)?;

    build_diff(diff).map_err(AppError::Git)
}

/// Diffs one commit against one of its parents — the graph's own "what did this commit change?".
///
/// `parent_index` is 0-based and defaults to the **first** parent, which is the only reading an
/// ordinary commit has. A merge commit has one such reading per parent and no canonical one, so the
/// caller can ask for the second (or later) side explicitly; that is what backs the graph's "Compare
/// against parent N" entries. A root commit has no parent at all and diffs against the empty tree,
/// so every one of its files reads as added.
///
/// Takes `&mut Repository` because of the stash detour below: `stash_foreach` needs a mutable
/// borrow, and a stash's *untracked* files live in a third parent that no ordinary tree-to-tree diff
/// would ever reach — without merging them in, stashing untracked work and then clicking the stash
/// shows a diff that silently omits it.
pub fn commit_diff(
    repo: &mut Repository,
    oid: &str,
    parent_index: Option<u32>,
) -> Result<GitDiff, AppError> {
    let commit_oid = Oid::from_str(oid).map_err(AppError::Git)?;

    let mut is_stash = false;
    let _ = repo.stash_foreach(|_index, _message, stash_oid| {
        if *stash_oid == commit_oid {
            is_stash = true;
            false
        } else {
            true
        }
    });

    let commit = repo.find_commit(commit_oid).map_err(AppError::Git)?;
    let parent_index = parent_index.unwrap_or(0) as usize;
    if commit.parent_count() > 0 && parent_index >= commit.parent_count() {
        return Err(AppError::InvalidInput(format!(
            "Parent {} does not exist on a commit with {} parents",
            parent_index + 1,
            commit.parent_count()
        )));
    }

    let commit_tree = commit.tree().map_err(AppError::Git)?;
    let parent_tree = if commit.parent_count() > 0 {
        let parent = commit.parent(parent_index).map_err(AppError::Git)?;
        Some(parent.tree().map_err(AppError::Git)?)
    } else {
        None
    };

    let mut diff_opts = DiffOptions::new();
    diff_opts.context_lines(3).ignore_whitespace_change(false);

    let diff = repo
        .diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&commit_tree),
            Some(&mut diff_opts),
        )
        .map_err(AppError::Git)?;

    let files: RefCell<Vec<GitDiffFile>> = RefCell::new(Vec::new());
    diff_foreach_files(&diff, &files, false).map_err(AppError::Git)?;

    if is_stash && commit.parent_count() == 3 {
        if let Ok(untracked_parent) = commit.parent(2) {
            if let Ok(untracked_tree) = untracked_parent.tree() {
                if let Ok(untracked_diff) =
                    repo.diff_tree_to_tree(None, Some(&untracked_tree), Some(&mut diff_opts))
                {
                    let _ = diff_foreach_files(&untracked_diff, &files, true);
                }
            }
        }
    }

    Ok(finalize(files.into_inner()))
}

/// Diffs a commit's tree directly against the literal working directory (not the index),
/// so uncommitted changes on top of that commit show up alongside its own historical delta.
pub fn diff_commit_to_workdir(repo: &Repository, oid: &str) -> Result<GitDiff, AppError> {
    let commit_oid = Oid::from_str(oid).map_err(AppError::Git)?;
    let commit = repo.find_commit(commit_oid).map_err(AppError::Git)?;
    let tree = commit.tree().map_err(AppError::Git)?;

    let mut diff_opts = DiffOptions::new();
    diff_opts.context_lines(3).ignore_whitespace_change(false);

    let diff = repo
        .diff_tree_to_workdir(Some(&tree), Some(&mut diff_opts))
        .map_err(AppError::Git)?;

    build_diff(diff).map_err(AppError::Git)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-gitdiff-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn tree_of(repo: &Repository, files: &[(&str, &str)]) -> Oid {
        let mut tb = repo.treebuilder(None).unwrap();
        for (name, content) in files {
            let blob = repo.blob(content.as_bytes()).unwrap();
            tb.insert(name, blob, 0o100644).unwrap();
        }
        tb.write().unwrap()
    }

    /// Commits `tree_oid`, moving HEAD onto it when `advance_head` — libgit2 refuses to move HEAD
    /// onto a commit whose first parent is not the current tip, so a *side* branch is written
    /// without touching HEAD and only the commit that rejoins the line advances it.
    fn commit_as(
        repo: &Repository,
        msg: &str,
        tree_oid: Oid,
        parents: &[Oid],
        advance_head: bool,
    ) -> Oid {
        let sig = get_git_signature(repo).unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        let parent_commits: Vec<git2::Commit> = parents
            .iter()
            .map(|p| repo.find_commit(*p).unwrap())
            .collect();
        let parent_refs: Vec<&git2::Commit> = parent_commits.iter().collect();
        let update_ref = if advance_head { Some("HEAD") } else { None };
        repo.commit(update_ref, &sig, &sig, msg, &tree, &parent_refs)
            .unwrap()
    }

    fn commit_to(repo: &Repository, msg: &str, tree_oid: Oid, parents: &[Oid]) -> Oid {
        commit_as(repo, msg, tree_oid, parents, true)
    }

    /// Linear history: c1 (a) → c2 (adds b) → c3 (edits b, adds c).
    fn linear_repo(name: &str) -> (std::path::PathBuf, Oid, Oid, Oid) {
        let dir = temp_dir(name);
        let repo = Repository::init(&dir).unwrap();
        let c1 = commit_to(&repo, "c1", tree_of(&repo, &[("a.txt", "a")]), &[]);
        let c2 = commit_to(
            &repo,
            "c2",
            tree_of(&repo, &[("a.txt", "a"), ("b.txt", "b")]),
            &[c1],
        );
        let c3 = commit_to(
            &repo,
            "c3",
            tree_of(&repo, &[("a.txt", "a"), ("b.txt", "bb"), ("c.txt", "c")]),
            &[c2],
        );
        (dir, c1, c2, c3)
    }

    #[test]
    fn merged_diff_spans_from_base_parent_to_head() {
        let (dir, _c1, c2, c3) = linear_repo("merged-span");
        let repo = Repository::open(&dir).unwrap();
        // base = c2 → left side is c2's parent (c1: only a.txt); head = c3.
        let diff = merged_commits_diff(&repo, &c2.to_string(), &c3.to_string()).unwrap();
        let paths: Vec<&str> = diff.files.iter().map(|f| f.new_path.as_str()).collect();
        assert!(paths.contains(&"b.txt"), "b.txt added within the range");
        assert!(paths.contains(&"c.txt"), "c.txt added within the range");
        assert!(
            !paths.contains(&"a.txt"),
            "a.txt is unchanged across the range"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn merged_diff_of_a_single_commit_matches_that_commit() {
        let (dir, _c1, _c2, c3) = linear_repo("merged-single");
        let repo = Repository::open(&dir).unwrap();
        // base == head == c3 → equivalent to c3 vs its own parent (edits b, adds c).
        let diff = merged_commits_diff(&repo, &c3.to_string(), &c3.to_string()).unwrap();
        let paths: Vec<&str> = diff.files.iter().map(|f| f.new_path.as_str()).collect();
        assert!(paths.contains(&"b.txt"));
        assert!(paths.contains(&"c.txt"));
        assert!(!paths.contains(&"a.txt"));
        std::fs::remove_dir_all(&dir).ok();
    }

    /// A two-parent merge: `c1` → (`feat` adds f.txt | `main` edits a.txt) → `m`.
    fn merge_repo(name: &str) -> (std::path::PathBuf, Oid) {
        let dir = temp_dir(name);
        let repo = Repository::init(&dir).unwrap();
        let c1 = commit_to(&repo, "c1", tree_of(&repo, &[("a.txt", "base")]), &[]);
        let main = commit_to(
            &repo,
            "main",
            tree_of(&repo, &[("a.txt", "changed")]),
            &[c1],
        );
        let feat = commit_as(
            &repo,
            "feat",
            tree_of(&repo, &[("a.txt", "base"), ("f.txt", "feat")]),
            &[c1],
            false,
        );
        let merge = commit_to(
            &repo,
            "merge",
            tree_of(&repo, &[("a.txt", "changed"), ("f.txt", "feat")]),
            &[main, feat],
        );
        (dir, merge)
    }

    #[test]
    fn commit_diff_defaults_to_the_first_parent() {
        let (dir, merge) = merge_repo("parent-default");
        let mut repo = Repository::open(&dir).unwrap();
        // vs parent 1 (main): only what the feature side brought in.
        let diff = commit_diff(&mut repo, &merge.to_string(), None).unwrap();
        let paths: Vec<&str> = diff.files.iter().map(|f| f.new_path.as_str()).collect();
        assert_eq!(paths, vec!["f.txt"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn commit_diff_against_the_second_parent_shows_the_other_side() {
        let (dir, merge) = merge_repo("parent-second");
        let mut repo = Repository::open(&dir).unwrap();
        // vs parent 2 (feat): only main's own edit — the whole point of the "vs parent N" entries.
        let diff = commit_diff(&mut repo, &merge.to_string(), Some(1)).unwrap();
        let paths: Vec<&str> = diff.files.iter().map(|f| f.new_path.as_str()).collect();
        assert_eq!(paths, vec!["a.txt"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn commit_diff_rejects_a_parent_the_commit_does_not_have() {
        let (dir, merge) = merge_repo("parent-out-of-range");
        let mut repo = Repository::open(&dir).unwrap();
        let err = commit_diff(&mut repo, &merge.to_string(), Some(2)).unwrap_err();
        assert!(
            err.to_string().contains("Parent 3"),
            "unexpected error: {err}"
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn commit_diff_of_a_root_commit_reads_every_file_as_added() {
        let (dir, c1, _c2, _c3) = linear_repo("parent-root");
        let mut repo = Repository::open(&dir).unwrap();
        // A root commit has no parent, so `parent_index` is moot — nothing is out of range.
        let diff = commit_diff(&mut repo, &c1.to_string(), Some(0)).unwrap();
        let paths: Vec<&str> = diff.files.iter().map(|f| f.new_path.as_str()).collect();
        assert_eq!(paths, vec!["a.txt"]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn merged_diff_from_root_commit_has_no_before_state() {
        let (dir, c1, _c2, c3) = linear_repo("merged-root");
        let repo = Repository::open(&dir).unwrap();
        // base = c1 (root, no parent) → left side is empty, so every file at c3 appears added.
        let diff = merged_commits_diff(&repo, &c1.to_string(), &c3.to_string()).unwrap();
        let paths: Vec<&str> = diff.files.iter().map(|f| f.new_path.as_str()).collect();
        assert!(paths.contains(&"a.txt"));
        assert!(paths.contains(&"b.txt"));
        assert!(paths.contains(&"c.txt"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
