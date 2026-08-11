//! Listing of the repository's files.
//!
//! `list_tracked_files` is the equivalent of `git ls-files`: it reads the repository index and
//! returns every tracked path, sorted and de-duplicated. Reading the index (rather than walking a
//! commit tree) means the list is available even before the first commit and reflects staged
//! additions/removals. It powers the command palette's "open a file" lookup, which fuzzy-matches a
//! query against these paths to jump straight to a file's contents and history.
//!
//! `list_tracked_files_on_disk` answers the narrower question the project files explorer asks —
//! "which of the repository's files can I open right now?" — and deliberately stops at the tracked
//! ones, so that browsing a repository in the app shows the same set of files as browsing it on its
//! forge.

use crate::error::AppError;
use git2::{Repository, Status, StatusOptions};
use std::collections::BTreeSet;

/// Returns the repository's tracked file paths (index contents), sorted and de-duplicated.
///
/// Conflicted entries carry the same path across stages 1/2/3; the `BTreeSet` collapses those to a
/// single entry. Paths that aren't valid UTF-8 are skipped (they can't round-trip to the frontend).
pub fn list_tracked_files(repo: &Repository) -> Result<Vec<String>, AppError> {
    let index = repo.index().map_err(AppError::Git)?;
    let mut paths = BTreeSet::new();
    for entry in index.iter() {
        if let Ok(path) = String::from_utf8(entry.path) {
            paths.insert(path);
        }
    }
    Ok(paths.into_iter().collect())
}

/// Returns the tracked files that still exist on disk, sorted and de-duplicated. This is
/// `git ls-files -c` minus the entries git would show as deleted, done through libgit2 rather than
/// by spawning `git`: the rest of the app has no dependency on a `git` binary being installed and
/// on `PATH`, and on a machine without Xcode's command line tools `/usr/bin/git` is a shim that
/// pops up an installer dialog.
///
/// **Untracked files are deliberately absent, and that is the whole point of the function.** The
/// explorer used to list them (`git ls-files -co --exclude-standard`), which made an app-side
/// browse of a repository disagree with the same repository on GitHub: build output nobody had
/// thought to ignore, a scratch file, a directory of test logs. `.gitignore` was never the fix —
/// it only ever covered what someone had remembered to write down, and the honest boundary is the
/// one git itself draws. A file that isn't in the index isn't part of the repository yet; it shows
/// up in the working-tree panel, where it can be staged, and joins this listing the moment it is.
///
/// It is still not a plain call to `list_tracked_files`: a tracked file deleted from disk (or
/// staged for deletion) is left out, because the explorer would otherwise list entries that open
/// on nothing.
pub fn list_tracked_files_on_disk(repo: &Repository) -> Result<Vec<String>, AppError> {
    let mut paths: BTreeSet<String> = list_tracked_files(repo)?.into_iter().collect();

    let mut options = StatusOptions::new();
    options
        // Only the deletions below are read out of this walk, and both are tracked-file statuses.
        // Leaving untracked scanning off also spares the recursive walk of every untracked
        // directory — on a repository with an unignored `node_modules`, that walk *was* the cost of
        // opening the view.
        .include_untracked(false)
        .include_ignored(false)
        // Directories are listed through their files; the explorer builds the tree itself.
        .include_unmodified(false);

    for entry in repo
        .statuses(Some(&mut options))
        .map_err(AppError::Git)?
        .iter()
    {
        let Some(path) = entry.path() else { continue };
        let status = entry.status();

        // Staged-then-deleted, or deleted on disk: tracked, but there is nothing to open.
        if status.contains(Status::WT_DELETED) || status.contains(Status::INDEX_DELETED) {
            paths.remove(path);
        }
    }

    Ok(paths.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::{list_tracked_files, list_tracked_files_on_disk};
    use git2::Repository;
    use std::fs;

    /// Fresh repository in its own temp directory, cleaned up by the caller.
    fn init_repo(name: &str) -> (std::path::PathBuf, Repository) {
        let dir = std::env::temp_dir().join(format!("gm-test-{}-{}", name, std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    fn stage(repo: &Repository, relative: &str) {
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new(relative)).unwrap();
        index.write().unwrap();
    }

    /// Staged files show up in the list, sorted and de-duplicated, even before any commit exists.
    #[test]
    fn lists_staged_files_sorted() {
        let dir = std::env::temp_dir().join(format!("gm-test-files-{}", std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(dir.join("src")).unwrap();
        let repo = Repository::init(&dir).unwrap();

        fs::write(dir.join("b.txt"), "b").unwrap();
        fs::write(dir.join("a.txt"), "a").unwrap();
        fs::write(dir.join("src/main.rs"), "fn main() {}").unwrap();

        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("b.txt")).unwrap();
        index.add_path(std::path::Path::new("a.txt")).unwrap();
        index.add_path(std::path::Path::new("src/main.rs")).unwrap();
        index.write().unwrap();

        let files = list_tracked_files(&repo).unwrap();
        assert_eq!(files, vec!["a.txt", "b.txt", "src/main.rs"]);

        fs::remove_dir_all(&dir).ok();
    }

    /// A fresh repository with an empty index yields no files (rather than erroring).
    #[test]
    fn empty_repo_lists_nothing() {
        let dir = std::env::temp_dir().join(format!("gm-test-files-empty-{}", std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();

        let files = list_tracked_files(&repo).unwrap();
        assert!(files.is_empty());

        fs::remove_dir_all(&dir).ok();
    }

    /// The explorer lists what git tracks, and nothing else — so that browsing a repository in the
    /// app and browsing it on its forge show the same files. `untracked.rs` here is covered by no
    /// `.gitignore` at all: being unignored is not what earns a file a place in this listing, being
    /// in the index is.
    #[test]
    fn explorer_lists_tracked_files_only() {
        let (dir, repo) = init_repo("wt-files");
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("tracked.txt"), "t").unwrap();
        fs::write(dir.join("src/untracked.rs"), "u").unwrap();
        stage(&repo, "tracked.txt");

        let files = list_tracked_files_on_disk(&repo).unwrap();

        assert_eq!(files, vec!["tracked.txt"]);
        fs::remove_dir_all(&dir).ok();
    }

    /// Staging is what a file crosses to become part of the repository, and the listing follows it
    /// there — the explorer isn't a view of the last commit, it's a view of the index.
    #[test]
    fn explorer_picks_a_file_up_once_it_is_staged() {
        let (dir, repo) = init_repo("wt-staged");
        fs::write(dir.join("new.txt"), "n").unwrap();

        assert!(list_tracked_files_on_disk(&repo).unwrap().is_empty());

        stage(&repo, "new.txt");

        assert_eq!(list_tracked_files_on_disk(&repo).unwrap(), vec!["new.txt"]);
        fs::remove_dir_all(&dir).ok();
    }

    /// Ignored files are absent — browsing a repo shouldn't mean browsing `node_modules`. Redundant
    /// with the untracked rule above as long as nothing is both ignored and staged, and kept anyway
    /// because it is the case a reader checks first.
    #[test]
    fn explorer_skips_ignored_files() {
        let (dir, repo) = init_repo("wt-ignored");
        fs::write(dir.join(".gitignore"), "ignored.log\n").unwrap();
        fs::write(dir.join("ignored.log"), "noise").unwrap();
        fs::write(dir.join("kept.txt"), "k").unwrap();
        stage(&repo, "kept.txt");

        let files = list_tracked_files_on_disk(&repo).unwrap();

        assert!(files.contains(&"kept.txt".to_string()));
        assert!(!files.contains(&"ignored.log".to_string()));
        fs::remove_dir_all(&dir).ok();
    }

    /// A tracked file deleted from disk is gone from the listing: the explorer only shows what it
    /// can actually open (this is where a plain `git ls-files -c` was wrong).
    #[test]
    fn explorer_drops_files_deleted_from_disk() {
        let (dir, repo) = init_repo("wt-deleted");
        fs::write(dir.join("gone.txt"), "g").unwrap();
        fs::write(dir.join("here.txt"), "h").unwrap();
        stage(&repo, "gone.txt");
        stage(&repo, "here.txt");
        fs::remove_file(dir.join("gone.txt")).unwrap();

        let files = list_tracked_files_on_disk(&repo).unwrap();

        assert_eq!(files, vec!["here.txt"]);
        fs::remove_dir_all(&dir).ok();
    }

    /// An empty repository lists nothing rather than erroring.
    #[test]
    fn explorer_of_empty_repo_lists_nothing() {
        let (dir, repo) = init_repo("wt-empty");

        assert!(list_tracked_files_on_disk(&repo).unwrap().is_empty());
        fs::remove_dir_all(&dir).ok();
    }
}
