//! Listing of the repository's tracked files.
//!
//! `list_tracked_files` is the equivalent of `git ls-files`: it reads the repository index and
//! returns every tracked path, sorted and de-duplicated. Reading the index (rather than walking a
//! commit tree) means the list is available even before the first commit and reflects staged
//! additions/removals. It powers the command palette's "open a file" lookup, which fuzzy-matches a
//! query against these paths to jump straight to a file's contents and history.

use crate::error::AppError;
use git2::Repository;
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

#[cfg(test)]
mod tests {
    use super::list_tracked_files;
    use git2::Repository;
    use std::fs;

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
}
