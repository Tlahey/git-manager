use crate::error::AppError;
use crate::models::{GitDiff, GitDiffFile, GitDiffHunk, GitDiffLine};
use crate::services::git_ref_resolve::resolve_first_ref;
use git2::{DiffOptions, Oid, Repository};
use serde::Serialize;
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

/// Resolves one ref name (branch, remote branch, tag, SHA, `HEAD~2`…) to the tree it points at.
///
/// Uses the same tolerant lookup as the merge-target and daily-summary features
/// (`git_ref_resolve::resolve_first_ref`) — remote branch, then local branch, then any revision —
/// so a caller can pass whatever the frontend's branch list holds (`origin/main` as well as `main`)
/// without having to say which kind of ref it is.
fn resolve_ref_tree<'r>(repo: &'r Repository, name: &str) -> Result<git2::Tree<'r>, AppError> {
    let candidates = [name.to_string()];
    let (_, commit) = resolve_first_ref(repo, &candidates)
        .ok_or_else(|| AppError::InvalidInput(format!("Ref '{name}' could not be resolved")))?;
    commit.tree().map_err(AppError::Git)
}

/// Diffs two arbitrary refs against each other — what the "compare two branches" view shows.
///
/// This is the DIRECT two-dot diff (`git diff <base> <head>`), deliberately **not** the three-dot
/// `merge-base(base, head)..head` one. The two answer different questions: this one is "how do these
/// two trees differ right now", which includes everything the base gained since they forked, while
/// the merge-base variant is "what would this branch add" and already exists for the branch-scoped
/// AI features (`ai_context.rs`'s `Range` scope). Switching this to a merge-base diff would silently
/// hide the base's own commits from a comparison the user asked for explicitly, so if a three-dot
/// mode is ever wanted it belongs beside this one as a second mode, not as a change to it.
pub fn diff_refs(repo: &Repository, base_ref: &str, head_ref: &str) -> Result<GitDiff, AppError> {
    let base_tree = resolve_ref_tree(repo, base_ref)?;
    let head_tree = resolve_ref_tree(repo, head_ref)?;

    let mut diff_opts = DiffOptions::new();
    diff_opts.context_lines(3).ignore_whitespace_change(false);

    let diff = repo
        .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut diff_opts))
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

// ─── Raw file content resolution ────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawFileDiffContents {
    pub original: String,
    pub modified: String,
}

/// A blob's text content, or `"[Binary Content]"` for a binary blob, or `None` if the blob can't
/// be found or isn't valid UTF-8.
fn blob_text(repo: &Repository, blob_id: Oid) -> Option<String> {
    let blob = repo.find_blob(blob_id).ok()?;
    if blob.is_binary() {
        return Some("[Binary Content]".to_string());
    }
    std::str::from_utf8(blob.content())
        .ok()
        .map(|s| s.to_string())
}

/// A tree's version of `file_path`, or an empty string when the tree has no such entry — not an
/// error, just "there is no such version" (a file added since that tree, e.g. at a repo's root
/// commit).
fn file_content_in_tree(repo: &Repository, tree: &git2::Tree, file_path: &str) -> String {
    tree.get_path(std::path::Path::new(file_path))
        .ok()
        .and_then(|entry| blob_text(repo, entry.id()))
        .unwrap_or_default()
}

/// The index's (staged) version of `file_path`. `None` when the file isn't staged, distinct from
/// an empty string so callers can fall back to another source (HEAD) rather than showing "no
/// content" for a file that simply isn't in the index yet.
fn file_content_in_index(repo: &Repository, file_path: &str) -> Option<String> {
    let index = repo.index().ok()?;
    let entry = index.get_path(std::path::Path::new(file_path), 0)?;
    blob_text(repo, entry.id)
}

/// `HEAD`'s tree, or `None` on a brand new repository with no commits yet.
fn head_tree(repo: &Repository) -> Option<git2::Tree<'_>> {
    repo.head().ok()?.peel_to_commit().ok()?.tree().ok()
}

/// Resolves the two sides of the raw-content diff view: `original` is the "before" version — the
/// target commit's parent, HEAD, or nothing on a repo's first commit — and `modified` is the
/// "after" version — the target commit, the index, or the literal file on disk.
///
/// `base_oid`, when present with `oid`, scopes `original` to a multi-commit range: it becomes the
/// oldest selected commit's first-parent tree rather than `oid`'s own — matching
/// `merged_commits_diff`'s `base_oid^..head_oid` semantics for the multi-select diff panel.
///
/// Every branch below falls back to an empty string rather than propagating an error when a
/// version genuinely doesn't exist (no earlier commit, file not yet staged, nothing at HEAD on a
/// fresh repo): those are legitimate "no such version" answers, not hidden failures. A real error
/// (an unreadable object, a malformed oid) already stops the function earlier, at
/// `Oid::from_str`/`find_commit`/`tree()`, which do propagate.
pub fn raw_file_contents(
    repo: &Repository,
    repo_path: &str,
    file_path: &str,
    staged: bool,
    oid: Option<&str>,
    base_oid: Option<&str>,
) -> Result<RawFileDiffContents, AppError> {
    let original = if let Some(oid_str) = oid {
        let base_commit_oid = Oid::from_str(base_oid.unwrap_or(oid_str)).map_err(AppError::Git)?;
        let commit = repo.find_commit(base_commit_oid).map_err(AppError::Git)?;
        match commit.parent(0) {
            Ok(parent) => {
                file_content_in_tree(repo, &parent.tree().map_err(AppError::Git)?, file_path)
            }
            Err(_) => String::new(),
        }
    } else if staged {
        head_tree(repo)
            .map(|tree| file_content_in_tree(repo, &tree, file_path))
            .unwrap_or_default()
    } else {
        file_content_in_index(repo, file_path).unwrap_or_else(|| {
            head_tree(repo)
                .map(|tree| file_content_in_tree(repo, &tree, file_path))
                .unwrap_or_default()
        })
    };

    let modified = if let Some(oid_str) = oid {
        let commit_oid = Oid::from_str(oid_str).map_err(AppError::Git)?;
        let commit = repo.find_commit(commit_oid).map_err(AppError::Git)?;
        file_content_in_tree(repo, &commit.tree().map_err(AppError::Git)?, file_path)
    } else if staged {
        file_content_in_index(repo, file_path).unwrap_or_default()
    } else {
        read_workdir_file(repo_path, file_path)
    };

    Ok(RawFileDiffContents { original, modified })
}

/// A file's raw text content at a specific commit — the graph's read-only "open this file as it
/// was in this commit" action. Delegates blob resolution to `file_content_in_tree`/`blob_text`, so
/// a path that doesn't exist in that tree reads as "no such version" (empty string) and a binary
/// blob reads as `"[Binary Content]"` — the same graceful behavior every other raw-content reader
/// in this module already has, rather than hard-erroring on a missing path or non-UTF8 content.
pub fn commit_file_content(
    repo: &Repository,
    oid: &str,
    file_path: &str,
) -> Result<String, AppError> {
    let commit_oid = Oid::from_str(oid).map_err(AppError::Git)?;
    let commit = repo.find_commit(commit_oid).map_err(AppError::Git)?;
    let tree = commit.tree().map_err(AppError::Git)?;
    Ok(file_content_in_tree(repo, &tree, file_path))
}

/// The target commit's version of `file_path` (left) and the current working-tree version (right)
/// — the fixup "Commit changes" diff. Unlike `raw_file_contents`, `original` is the file at `oid`'s
/// own tree (not its parent), so the diff shows how the working copy differs from the fixup
/// target.
pub fn commit_file_vs_workdir(
    repo: &Repository,
    repo_path: &str,
    oid: &str,
    file_path: &str,
) -> Result<RawFileDiffContents, AppError> {
    let commit_oid = Oid::from_str(oid).map_err(AppError::Git)?;
    let commit = repo.find_commit(commit_oid).map_err(AppError::Git)?;
    let tree = commit.tree().map_err(AppError::Git)?;
    let original = file_content_in_tree(repo, &tree, file_path);
    let modified = read_workdir_file(repo_path, file_path);

    Ok(RawFileDiffContents { original, modified })
}

/// Reads a file straight off disk (not through git at all) — the literal working-tree contents,
/// used for the "modified" side of an unstaged/uncommitted comparison. `"[Binary Content]"` for
/// non-UTF-8 bytes, an empty string if the file can't be read (deleted, permissions).
fn read_workdir_file(repo_path: &str, file_path: &str) -> String {
    match std::fs::read(std::path::Path::new(repo_path).join(file_path)) {
        Ok(bytes) => match std::str::from_utf8(&bytes) {
            Ok(content) => content.to_string(),
            Err(_) => String::from("[Binary Content]"),
        },
        Err(_) => String::new(),
    }
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

    /// Commits without moving any reference — how a second branch can fork off an earlier commit
    /// while HEAD stays where it is (git2 refuses a HEAD-updating commit whose first parent isn't
    /// the current tip).
    fn commit_dangling(repo: &Repository, msg: &str, tree_oid: Oid, parents: &[Oid]) -> Oid {
        let sig = get_git_signature(repo).unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        let parent_commits: Vec<git2::Commit> = parents
            .iter()
            .map(|p| repo.find_commit(*p).unwrap())
            .collect();
        let parent_refs: Vec<&git2::Commit> = parent_commits.iter().collect();
        repo.commit(None, &sig, &sig, msg, &tree, &parent_refs)
            .unwrap()
    }

    /// Two branches off a shared root: `main` (adds `only-main.txt`, edits `shared.txt`) and
    /// `feature` (adds `only-feature.txt`), so every delta direction is observable.
    fn forked_repo(name: &str) -> std::path::PathBuf {
        let dir = temp_dir(name);
        let repo = Repository::init(&dir).unwrap();
        let root = commit_to(&repo, "root", tree_of(&repo, &[("shared.txt", "v1")]), &[]);
        let main = commit_to(
            &repo,
            "main work",
            tree_of(&repo, &[("shared.txt", "v2"), ("only-main.txt", "m")]),
            &[root],
        );
        let feature = commit_dangling(
            &repo,
            "feature work",
            tree_of(&repo, &[("shared.txt", "v1"), ("only-feature.txt", "f")]),
            &[root],
        );
        repo.branch("main", &repo.find_commit(main).unwrap(), true)
            .unwrap();
        repo.branch("feature", &repo.find_commit(feature).unwrap(), true)
            .unwrap();
        dir
    }

    #[test]
    fn refs_diff_reports_both_sides_of_a_fork() {
        let dir = forked_repo("refs-fork");
        let repo = Repository::open(&dir).unwrap();
        let diff = diff_refs(&repo, "main", "feature").unwrap();
        let by_path: Vec<(&str, &str)> = diff
            .files
            .iter()
            .map(|f| {
                (
                    if f.new_path.is_empty() {
                        f.old_path.as_str()
                    } else {
                        f.new_path.as_str()
                    },
                    f.status.as_str(),
                )
            })
            .collect();
        // Going main → feature: main's own file disappears, feature's appears, shared reverts.
        assert!(
            by_path.contains(&("only-main.txt", "deleted")),
            "{by_path:?}"
        );
        assert!(
            by_path.contains(&("only-feature.txt", "added")),
            "{by_path:?}"
        );
        assert!(by_path.contains(&("shared.txt", "modified")), "{by_path:?}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn refs_diff_is_direction_sensitive() {
        let dir = forked_repo("refs-direction");
        let repo = Repository::open(&dir).unwrap();
        let reversed = diff_refs(&repo, "feature", "main").unwrap();
        let status_of = |path: &str| {
            reversed
                .files
                .iter()
                .find(|f| f.new_path == path || f.old_path == path)
                .map(|f| f.status.clone())
        };
        assert_eq!(status_of("only-main.txt").as_deref(), Some("added"));
        assert_eq!(status_of("only-feature.txt").as_deref(), Some("deleted"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn refs_diff_of_a_ref_against_itself_is_empty() {
        let dir = forked_repo("refs-identity");
        let repo = Repository::open(&dir).unwrap();
        let diff = diff_refs(&repo, "main", "main").unwrap();
        assert!(diff.files.is_empty());
        assert_eq!(diff.total_additions, 0);
        assert_eq!(diff.total_deletions, 0);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn refs_diff_accepts_a_raw_sha_on_either_side() {
        let dir = forked_repo("refs-sha");
        let repo = Repository::open(&dir).unwrap();
        let main_oid = repo
            .find_branch("main", git2::BranchType::Local)
            .unwrap()
            .get()
            .peel_to_commit()
            .unwrap()
            .id()
            .to_string();
        let diff = diff_refs(&repo, &main_oid, "feature").unwrap();
        assert!(!diff.files.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn refs_diff_rejects_a_ref_that_does_not_resolve() {
        let dir = forked_repo("refs-unknown");
        let repo = Repository::open(&dir).unwrap();
        let err = diff_refs(&repo, "main", "nope").unwrap_err();
        assert!(
            err.to_string().contains("nope"),
            "the message should name the unresolvable ref: {err}"
        );
        assert!(
            diff_refs(&repo, "", "main").is_err(),
            "a blank ref is not a ref"
        );
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

    #[test]
    fn raw_file_contents_of_a_commit_compares_against_its_parent() {
        let (dir, _c1, _c2, c3) = linear_repo("raw-commit");
        let repo = Repository::open(&dir).unwrap();
        let result = raw_file_contents(
            &repo,
            dir.to_str().unwrap(),
            "b.txt",
            false,
            Some(&c3.to_string()),
            None,
        )
        .unwrap();
        assert_eq!(result.original, "b");
        assert_eq!(result.modified, "bb");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn raw_file_contents_of_a_root_commit_has_no_original() {
        let (dir, c1, _c2, _c3) = linear_repo("raw-root-commit");
        let repo = Repository::open(&dir).unwrap();
        let result = raw_file_contents(
            &repo,
            dir.to_str().unwrap(),
            "a.txt",
            false,
            Some(&c1.to_string()),
            None,
        )
        .unwrap();
        assert_eq!(result.original, "");
        assert_eq!(result.modified, "a");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn raw_file_contents_staged_reads_head_then_index() {
        let dir = temp_dir("raw-staged");
        let repo = Repository::init(&dir).unwrap();
        commit_to(&repo, "c1", tree_of(&repo, &[("a.txt", "a")]), &[]);

        // Stage a modification to a.txt.
        std::fs::write(dir.join("a.txt"), "a-staged").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("a.txt")).unwrap();
        index.write().unwrap();

        let result =
            raw_file_contents(&repo, dir.to_str().unwrap(), "a.txt", true, None, None).unwrap();
        assert_eq!(result.original, "a");
        assert_eq!(result.modified, "a-staged");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn raw_file_contents_unstaged_reads_working_tree_and_falls_back_to_head() {
        let dir = temp_dir("raw-unstaged");
        let repo = Repository::init(&dir).unwrap();
        commit_to(&repo, "c1", tree_of(&repo, &[("a.txt", "a")]), &[]);

        // Edit on disk without staging.
        std::fs::write(dir.join("a.txt"), "a-edited").unwrap();

        let result =
            raw_file_contents(&repo, dir.to_str().unwrap(), "a.txt", false, None, None).unwrap();
        // Not staged, so `original` falls back through the (empty) index to HEAD.
        assert_eq!(result.original, "a");
        assert_eq!(result.modified, "a-edited");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn commit_file_vs_workdir_compares_the_commits_own_tree_to_disk() {
        let (dir, _c1, c2, _c3) = linear_repo("commit-vs-workdir");
        // Edit b.txt on disk beyond what any commit recorded.
        std::fs::write(dir.join("b.txt"), "b-in-progress").unwrap();
        let repo = Repository::open(&dir).unwrap();

        let result =
            commit_file_vs_workdir(&repo, dir.to_str().unwrap(), &c2.to_string(), "b.txt").unwrap();
        assert_eq!(result.original, "b");
        assert_eq!(result.modified, "b-in-progress");
        std::fs::remove_dir_all(&dir).ok();
    }
}
