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
    }
}
