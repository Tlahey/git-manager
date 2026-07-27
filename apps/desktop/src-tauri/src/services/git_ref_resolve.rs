//! Resolving a "which branch do we mean?" candidate list to an actual commit.
//!
//! Several features need the repo's *main* branch without being able to assume what it is called:
//! the merge-target indicator compares HEAD against it, and the daily summary describes what landed
//! on it. Both are configured with the same ordered candidate list (`origin/main`, `origin/master`,
//! … — see `DEFAULT_TARGET_BRANCHES` in the frontend), and both need the same tolerant lookup, so
//! the resolution lives here rather than being duplicated per feature.

use git2::{BranchType, Commit, Repository};

/// Resolves the first candidate in `candidates` that exists in `repo`, returning it with its commit.
///
/// Candidates are tried in order and each is looked up as a remote branch first (`origin/main`),
/// then as a local branch (`main`), then as a raw revision — so a list can mix `origin/main`,
/// `develop` and a tag without the caller caring which is which. Returns `None` when nothing
/// resolves, which is the normal state of a repo with no remote yet.
pub fn resolve_first_ref<'repo>(
    repo: &'repo Repository,
    candidates: &[String],
) -> Option<(String, Commit<'repo>)> {
    for candidate in candidates {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        let commit = repo
            .find_branch(trimmed, BranchType::Remote)
            .ok()
            .and_then(|b| b.get().peel_to_commit().ok())
            .or_else(|| {
                repo.find_branch(trimmed, BranchType::Local)
                    .ok()
                    .and_then(|b| b.get().peel_to_commit().ok())
            })
            .or_else(|| {
                repo.revparse_single(trimmed)
                    .ok()
                    .and_then(|obj| obj.peel_to_commit().ok())
            });
        if let Some(commit) = commit {
            return Some((trimmed.to_string(), commit));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;
    use std::path::PathBuf;

    fn init_repo(name: &str) -> (PathBuf, Repository) {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-ref-resolve-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        {
            // Every git2 handle below borrows `repo` and implements `Drop`, so their scope has to
            // end before `repo` is moved into the return value.
            let sig = get_git_signature(&repo).unwrap();
            let tree_oid = repo.treebuilder(None).unwrap().write().unwrap();
            let tree = repo.find_tree(tree_oid).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
                .unwrap();
            // `Repository::init` honours the host's `init.defaultBranch`; pin the name the tests use.
            let head = repo.head().unwrap().peel_to_commit().unwrap();
            repo.branch("main", &head, true).unwrap();
        }
        repo.set_head("refs/heads/main").unwrap();
        (dir, repo)
    }

    #[test]
    fn falls_through_to_a_local_branch_when_the_remote_is_absent() {
        let (dir, repo) = init_repo("local-fallback");
        let resolved = resolve_first_ref(&repo, &["origin/main".into(), "main".into()]);
        assert_eq!(resolved.map(|(name, _)| name), Some("main".to_string()));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn returns_none_when_no_candidate_resolves() {
        let (dir, repo) = init_repo("none");
        assert!(resolve_first_ref(&repo, &["origin/nope".into()]).is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn skips_blank_candidates() {
        let (dir, repo) = init_repo("blank");
        let resolved = resolve_first_ref(&repo, &["".into(), "  ".into(), "main".into()]);
        assert_eq!(resolved.map(|(name, _)| name), Some("main".to_string()));
        std::fs::remove_dir_all(&dir).ok();
    }
}
