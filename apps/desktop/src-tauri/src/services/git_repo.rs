use crate::models::GitRepo;
use git2::Repository;

/// Builds a `GitRepo` snapshot (name, HEAD, dirty/detached state, remotes) from an open
/// `git2::Repository`. Single source of truth — used by `open_repo`, `clone_repo` and
/// `init_repo`, which previously each reimplemented this inline.
pub fn build_git_repo(repo: &Repository, path: String) -> GitRepo {
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let head = repo
        .head()
        .ok()
        .and_then(|h| {
            if h.is_branch() {
                h.shorthand().map(|s| s.to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| "HEAD".to_string());

    // When `path` is a linked worktree, resolve the owning repository's main worktree so the
    // frontend can scope per-repo settings (protected branches, theme, worktree default files, …)
    // to the repo rather than each worktree individually. A linked worktree's gitdir is
    // `<main>/.git/worktrees/<name>`, so three levels up is the main worktree. A non-worktree repo
    // owns itself. (Standard non-bare layout; not the rare relocated `.git`/`--separate-git-dir`
    // case.)
    let main_worktree_path = if repo.is_worktree() {
        repo.path()
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .and_then(|p| p.to_str())
            .map(|s| s.to_string())
            .unwrap_or_else(|| path.clone())
    } else {
        path.clone()
    };

    let is_detached = repo.head_detached().unwrap_or(false);
    // Same options as `get_repo_status`: untracked files count as dirty, gitignored ones don't —
    // `statuses(None)` falls back to libgit2 defaults that include ignored entries, which kept
    // any repo containing build artifacts (node_modules/, target/, …) permanently flagged dirty.
    let mut status_opts = git2::StatusOptions::new();
    status_opts.include_untracked(true);
    let is_dirty = repo
        .statuses(Some(&mut status_opts))
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let mut remotes = Vec::new();
    if let Ok(repo_remotes) = repo.remotes() {
        for remote_name in repo_remotes.iter().flatten() {
            if let Ok(remote) = repo.find_remote(remote_name) {
                if let Some(url) = remote.url() {
                    remotes.push(url.to_string());
                }
            }
        }
    }

    GitRepo {
        path,
        name,
        head,
        is_detached,
        is_dirty,
        remotes,
        main_worktree_path,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::git_worktree::add_worktree;
    use crate::utils::get_git_signature;
    use std::path::Path;

    /// A main repo owns itself: `main_worktree_path` equals its own path.
    #[test]
    fn build_git_repo_main_worktree_path_is_self_for_a_normal_repo() {
        let dir = std::env::temp_dir().join(format!("gm-test-repo-self-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();

        let built = build_git_repo(&repo, dir.to_str().unwrap().to_string());
        assert_eq!(built.main_worktree_path, dir.to_str().unwrap());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A linked worktree resolves back to the owning repo's main worktree path.
    #[test]
    fn build_git_repo_resolves_linked_worktree_to_the_owning_repo() {
        let dir = std::env::temp_dir().join(format!("gm-test-repo-owner-{}", std::process::id()));
        let wt_dir =
            std::env::temp_dir().join(format!("gm-test-repo-owner-wt-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::remove_dir_all(&wt_dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();

        // A worktree can only be added once HEAD points at a real commit.
        let sig = get_git_signature(&repo).unwrap();
        let commit_oid = {
            let tree_oid = repo.index().unwrap().write_tree().unwrap();
            let tree = repo.find_tree(tree_oid).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
                .unwrap()
        };
        add_worktree(
            dir.to_str().unwrap(),
            wt_dir.to_str().unwrap(),
            &commit_oid.to_string(),
        )
        .unwrap();

        let wt_repo = Repository::open(&wt_dir).unwrap();
        let built = build_git_repo(&wt_repo, wt_dir.to_str().unwrap().to_string());
        // The worktree points back at the main repo, not at its own path.
        let expected = std::fs::canonicalize(&dir).unwrap();
        let got = std::fs::canonicalize(Path::new(&built.main_worktree_path)).unwrap();
        assert_eq!(got, expected);

        std::fs::remove_dir_all(&wt_dir).ok();
        std::fs::remove_dir_all(&dir).ok();
    }
}
