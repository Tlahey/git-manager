use crate::error::AppError;
use crate::models::{GitStatus, GitStatusEntry};
use git2::{Repository, Status, StatusOptions};

/// Classifies every working-tree/index entry into staged/unstaged/untracked/conflicted, the one
/// place this app decides what a `git2::Status` bit-flag combination means.
///
/// `get_repo_status` (the detailed sidebar view) and `get_repo_summary` (the dashboard's per-repo
/// card, which only needs counts) both call this rather than each walking `repo.statuses()` with
/// their own copy of the classification rules — two copies had already drifted apart before this
/// was extracted, since nothing forced a fix to one to be mirrored in the other.
pub fn classify_statuses(repo: &Repository) -> Result<GitStatus, AppError> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut opts)).map_err(AppError::Git)?;

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicted = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        if status.contains(Status::CONFLICTED) {
            conflicted.push(path.clone());
            continue;
        }

        if status.contains(Status::WT_NEW) {
            untracked.push(path.clone());
            continue;
        }

        if status.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED,
        ) {
            let kind = if status.contains(Status::INDEX_NEW) {
                "added"
            } else if status.contains(Status::INDEX_DELETED) {
                "deleted"
            } else if status.contains(Status::INDEX_RENAMED) {
                "renamed"
            } else {
                "modified"
            };
            staged.push(GitStatusEntry {
                path: path.clone(),
                status: kind.to_string(),
                old_path: None,
            });
        }

        if status.intersects(Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_RENAMED) {
            let kind = if status.contains(Status::WT_DELETED) {
                "deleted"
            } else if status.contains(Status::WT_RENAMED) {
                "renamed"
            } else {
                "modified"
            };
            unstaged.push(GitStatusEntry {
                path: path.clone(),
                status: kind.to_string(),
                old_path: None,
            });
        }
    }

    Ok(GitStatus {
        staged,
        unstaged,
        untracked,
        conflicted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-gitstatus-{}-{}-{}",
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

    fn init_repo_with_commit(dir: &std::path::Path) -> Repository {
        let repo = Repository::init(dir).unwrap();
        std::fs::write(dir.join("committed.txt"), "hello\n").unwrap();
        let mut index = repo.index().unwrap();
        index
            .add_path(std::path::Path::new("committed.txt"))
            .unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let sig = get_git_signature(&repo).unwrap();
        {
            let tree = repo.find_tree(tree_id).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
                .unwrap();
        }
        repo
    }

    #[test]
    fn classifies_staged_unstaged_untracked_and_conflicted() {
        let dir = temp_dir("mixed");
        let repo = init_repo_with_commit(&dir);

        // Unstaged modification to the committed file.
        std::fs::write(dir.join("committed.txt"), "changed\n").unwrap();

        // Staged new file.
        std::fs::write(dir.join("staged.txt"), "new\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("staged.txt")).unwrap();
        index.write().unwrap();

        // Untracked file.
        std::fs::write(dir.join("untracked.txt"), "untracked\n").unwrap();

        let status = classify_statuses(&repo).unwrap();

        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].path, "staged.txt");
        assert_eq!(status.staged[0].status, "added");

        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].path, "committed.txt");
        assert_eq!(status.unstaged[0].status, "modified");

        assert_eq!(status.untracked, vec!["untracked.txt".to_string()]);
        assert!(status.conflicted.is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_clean_repo_reports_nothing() {
        let dir = temp_dir("clean");
        let repo = init_repo_with_commit(&dir);

        let status = classify_statuses(&repo).unwrap();

        assert!(status.staged.is_empty());
        assert!(status.unstaged.is_empty());
        assert!(status.untracked.is_empty());
        assert!(status.conflicted.is_empty());

        std::fs::remove_dir_all(&dir).ok();
    }
}
