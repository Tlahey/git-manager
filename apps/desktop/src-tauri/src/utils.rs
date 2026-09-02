use crate::error::AppError;
use crate::models::{GitCommit, GitSignature};
use git2::{Repository, Signature};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

/// The app's own directory in the user's home: `~/.git-manager`.
///
/// Everything the app keeps outside a repository lives under it — the settings file, the user
/// themes, the activity and AI logs, the archived daily summaries, the local boards. `HOME` is read
/// before `home_dir()` on purpose: the e2e suite points `HOME` at a scratch directory to isolate a
/// run from the developer's real state (`apps/e2e/support/isolatedAppState.ts`), and that only works
/// if every consumer resolves the home directory the same way.
pub fn app_data_dir() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok().map(PathBuf::from).or_else(|| {
        #[allow(deprecated)]
        std::env::home_dir()
    })?;
    Some(home.join(".git-manager"))
}

/// Shortens a full SHA-1 to 7 characters (or fewer if the SHA is shorter).
pub fn short_oid(sha: &str) -> String {
    sha[..7.min(sha.len())].to_string()
}

/// Stable per-repository slug: the readable directory name, plus a short hash of the absolute path
/// so two checkouts sharing a directory name (a worktree, a second clone) don't collide. Used to key
/// app-local storage under `~/.git-manager/<feature>/<repo-slug>/...` — e.g. `daily_summary_archive`
/// and the local board's disaster-recovery backup.
pub fn repo_slug(repo_path: &str) -> String {
    let name = Path::new(repo_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repo".to_string());
    let mut hasher = DefaultHasher::new();
    repo_path.hash(&mut hasher);
    let sanitized: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    format!("{sanitized}-{:x}", hasher.finish() & 0xffff_ffff)
}

/// Converts a `git2::Commit` into the serializable `GitCommit` model (same
/// subject/body split as `git_graph`).
pub fn commit_to_model(commit: &git2::Commit) -> GitCommit {
    let author = commit.author();
    let committer = commit.committer();
    let raw_message = commit.message().unwrap_or("").to_string();
    let subject = raw_message.lines().next().unwrap_or("").to_string();
    let body = raw_message.lines().skip(2).collect::<Vec<_>>().join("\n");
    let oid_str = commit.id().to_string();

    GitCommit {
        short_oid: short_oid(&oid_str),
        oid: oid_str,
        message: raw_message,
        subject,
        body,
        author: GitSignature {
            name: author.name().unwrap_or("").to_string(),
            email: author.email().unwrap_or("").to_string(),
            timestamp: author.when().seconds(),
        },
        committer: GitSignature {
            name: committer.name().unwrap_or("").to_string(),
            email: committer.email().unwrap_or("").to_string(),
            timestamp: committer.when().seconds(),
        },
        parent_oids: commit.parent_ids().map(|p| p.to_string()).collect(),
    }
}

/// Builds a git2 signature from the repo config's `user.name`/`user.email`,
/// with the same fallback values used throughout the code (`"Unknown"` /
/// `"unknown@unknown.com"`).
pub fn get_git_signature(repo: &Repository) -> Result<Signature<'static>, AppError> {
    let config = repo.config().map_err(AppError::Git)?;
    let author_name = config
        .get_string("user.name")
        .unwrap_or_else(|_| "Unknown".to_string());
    let author_email = config
        .get_string("user.email")
        .unwrap_or_else(|_| "unknown@unknown.com".to_string());

    Signature::now(&author_name, &author_email).map_err(AppError::Git)
}

/// Extracts the `owner/repo` slug from a GitHub remote URL
/// (`git@github.com:owner/repo.git` or `https://github.com/owner/repo.git`).
/// Returns `None` if the remote isn't a recognizable GitHub URL.
fn github_owner_repo(remote_url: &str) -> Option<&str> {
    let owner_repo = remote_url
        .strip_prefix("git@github.com:")
        .or_else(|| remote_url.strip_prefix("https://github.com/"))
        .or_else(|| remote_url.strip_prefix("http://github.com/"))?;

    let owner_repo = owner_repo.trim_end_matches('/').trim_end_matches(".git");
    if owner_repo.is_empty() || !owner_repo.contains('/') {
        return None;
    }
    Some(owner_repo)
}

/// Turns a GitHub remote URL (`git@github.com:owner/repo.git` or
/// `https://github.com/owner/repo.git`) plus a commit OID into the commit's web URL.
/// Returns `None` if the remote isn't a recognizable GitHub URL.
pub fn github_web_url(remote_url: &str, oid: &str) -> Option<String> {
    let owner_repo = github_owner_repo(remote_url)?;
    Some(format!("https://github.com/{owner_repo}/commit/{oid}"))
}

/// Turns a GitHub remote URL plus a tag name into the tag's release page URL
/// (`https://github.com/owner/repo/releases/tag/<name>`).
/// Returns `None` if the remote isn't a recognizable GitHub URL.
pub fn github_tag_url(remote_url: &str, tag_name: &str) -> Option<String> {
    let owner_repo = github_owner_repo(remote_url)?;
    Some(format!(
        "https://github.com/{owner_repo}/releases/tag/{tag_name}"
    ))
}

/// Turns a GitHub remote URL plus a branch name into the branch's tree page URL
/// (`https://github.com/owner/repo/tree/<name>`).
/// Returns `None` if the remote isn't a recognizable GitHub URL.
pub fn github_branch_url(remote_url: &str, branch_name: &str) -> Option<String> {
    let owner_repo = github_owner_repo(remote_url)?;
    Some(format!(
        "https://github.com/{owner_repo}/tree/{branch_name}"
    ))
}

/// Safely resolves a repo-relative working-tree path, refusing anything that escapes `repo_path` —
/// whether via `..` segments or via a symlink (including an ordinary-looking *untracked* symlink
/// sitting in the working tree) that points outside it.
///
/// `std::fs::read` and `Path::is_file()`/`Path::exists()` all follow symlinks transparently, with
/// no containment check of their own. An attacker who can place a file in a folder the user later
/// opens as a repository (a downloaded archive, a shared folder — not necessarily a `git clone`) can
/// drop an untracked symlink such as `notes.txt -> /Users/victim/.ssh/id_rsa`. It shows up as an
/// ordinary untracked file everywhere the app lists working-tree entries, and any caller that reads
/// its *content* via a plain join+read would silently read the target instead — see
/// `git_diff::read_workdir_file` (issue #512: the target's content lands in the diff viewer, and
/// from there can be sent to a configured AI provider) and `git_commit::discard_file_changes`
/// (issue #513: the target's content is written as a durable git blob for the discard's undo
/// snapshot — worse, since it survives the app closing). Every caller that reads a working-tree
/// file's bytes from a path it did not just write itself must resolve it through this helper first.
///
/// Resolution is by full canonicalization (of both `repo_path` and the joined path), which walks
/// the *entire* symlink chain and every `..` — so a symlink several hops deep, or nested inside an
/// escaping symlinked directory, is caught exactly like a direct one. Returns `None` when:
/// - `repo_path` itself fails to canonicalize (should not normally happen — the repo is open),
/// - the joined path doesn't exist, or otherwise fails to canonicalize (deleted, permissions), or
/// - it canonicalizes to something outside the canonicalized `repo_path`.
///
/// An ordinary file, and a symlink that resolves to a target *inside* the repo, both canonicalize to
/// a path under `repo_path` and are returned unchanged — this only blocks escapes, not symlinks.
pub fn resolve_workdir_file(repo_path: &str, file_path: &str) -> Option<PathBuf> {
    let repo_root = Path::new(repo_path).canonicalize().ok()?;
    let joined = repo_root.join(file_path);
    let resolved = joined.canonicalize().ok()?;
    if resolved.starts_with(&repo_root) {
        Some(resolved)
    } else {
        None
    }
}

/// Like `resolve_workdir_file`, but for a path about to be *written* rather than read — the target
/// may legitimately not exist yet (restoring a file whose discard also deleted its parent
/// directory; see `git_undo::restore_file_blob`, issue #515), so it cannot rely on
/// `Path::canonicalize` alone, which requires every component to already exist.
///
/// - If something already sits at `repo_path`/`file_path` — a regular file, a directory, or a
///   symlink, dangling or not — this defers entirely to `resolve_workdir_file`, which resolves the
///   full symlink chain and checks containment. A symlink is therefore never written through: if it
///   points inside the repo it resolves there and is returned as-is (so overwriting an in-repo
///   symlink's target still works, matching a plain `fs::write`'s own behavior); if it points
///   outside, or is dangling so it can't be canonicalized at all, this returns `None` and the write
///   is refused rather than risking a create-through-dangling-symlink escape.
/// - Otherwise (nothing at all exists at that exact path yet) this walks up to the closest
///   *existing* ancestor directory, canonicalizes only that ancestor (walking its own symlink
///   chain, so an intermediate symlinked directory is caught the same way), and requires it to lie
///   inside the canonicalized repo root. The missing trailing components are then re-appended
///   verbatim to the canonicalized ancestor, giving the caller a path it can safely
///   `create_dir_all` + write to.
///
/// An ordinary new file under existing or not-yet-existing in-repo directories resolves exactly
/// like a plain join; only an escape (via a symlink anywhere in the chain, or via a resolved `..`)
/// is refused.
pub fn resolve_workdir_write_target(repo_path: &str, file_path: &str) -> Option<PathBuf> {
    let repo_root = Path::new(repo_path).canonicalize().ok()?;
    let joined = repo_root.join(file_path);

    if joined.symlink_metadata().is_ok() {
        // Something already exists at this exact path (file, dir, or symlink) — resolve and
        // contain-check it fully rather than special-casing it here.
        return resolve_workdir_file(repo_path, file_path);
    }

    let mut existing_ancestor = joined.clone();
    let mut trailing: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if existing_ancestor.symlink_metadata().is_ok() {
            break;
        }
        let parent = existing_ancestor.parent()?;
        let name = existing_ancestor.file_name()?;
        trailing.push(name.to_os_string());
        existing_ancestor = parent.to_path_buf();
    }

    let canonical_ancestor = existing_ancestor.canonicalize().ok()?;
    if !canonical_ancestor.starts_with(&repo_root) {
        return None;
    }

    let mut result = canonical_ancestor;
    for component in trailing.into_iter().rev() {
        result.push(component);
    }
    Some(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_tag_url_handles_ssh_and_https_remotes() {
        assert_eq!(
            github_tag_url("git@github.com:owner/repo.git", "v1.0.0"),
            Some("https://github.com/owner/repo/releases/tag/v1.0.0".to_string())
        );
        assert_eq!(
            github_tag_url("https://github.com/owner/repo.git", "v1.0.0"),
            Some("https://github.com/owner/repo/releases/tag/v1.0.0".to_string())
        );
    }

    #[test]
    fn github_tag_url_returns_none_for_non_github_remotes() {
        assert_eq!(github_tag_url("git@gitlab.com:owner/repo.git", "v1"), None);
        assert_eq!(github_tag_url("https://github.com/", "v1"), None);
    }

    #[test]
    fn github_branch_url_builds_the_tree_page_url() {
        assert_eq!(
            github_branch_url("git@github.com:owner/repo.git", "main"),
            Some("https://github.com/owner/repo/tree/main".to_string())
        );
        assert_eq!(github_branch_url("git@gitlab.com:o/r.git", "main"), None);
    }

    /// Two checkouts sharing a directory name must not share a storage folder.
    #[test]
    fn repo_slug_disambiguates_same_named_checkouts() {
        let a = repo_slug("/Users/x/Workspace/git-manager");
        let b = repo_slug("/Users/x/other/git-manager");
        assert_ne!(a, b);
        assert!(a.starts_with("git-manager-"));
        // Stable across calls, or yesterday's file would land in a new folder every run.
        assert_eq!(a, repo_slug("/Users/x/Workspace/git-manager"));
    }

    #[test]
    fn repo_slug_sanitizes_unusual_directory_names() {
        assert!(repo_slug("/tmp/my repo!").starts_with("my-repo-"));
    }

    // ─── resolve_workdir_file ──────────────────────────────────────────────────

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-utils-{name}-{}-{}",
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

    #[test]
    fn resolve_workdir_file_accepts_an_ordinary_in_repo_file() {
        let dir = temp_dir("ordinary");
        std::fs::write(dir.join("a.txt"), "hello").unwrap();

        let resolved = resolve_workdir_file(dir.to_str().unwrap(), "a.txt").unwrap();
        assert_eq!(resolved, dir.canonicalize().unwrap().join("a.txt"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn resolve_workdir_file_follows_a_symlink_that_stays_inside_the_repo() {
        let dir = temp_dir("symlink-inside");
        std::fs::write(dir.join("real.txt"), "inside").unwrap();
        std::os::unix::fs::symlink(dir.join("real.txt"), dir.join("link.txt")).unwrap();

        let resolved = resolve_workdir_file(dir.to_str().unwrap(), "link.txt").unwrap();
        assert_eq!(resolved, dir.canonicalize().unwrap().join("real.txt"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn resolve_workdir_file_refuses_a_symlink_escaping_the_repo() {
        let outside = temp_dir("symlink-outside-target");
        std::fs::write(outside.join("secret.txt"), "top secret").unwrap();

        let repo = temp_dir("symlink-outside-repo");
        std::os::unix::fs::symlink(outside.join("secret.txt"), repo.join("notes.txt")).unwrap();

        assert!(resolve_workdir_file(repo.to_str().unwrap(), "notes.txt").is_none());

        std::fs::remove_dir_all(&outside).ok();
        std::fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn resolve_workdir_file_refuses_a_dot_dot_escape() {
        let outside = temp_dir("dotdot-outside");
        std::fs::write(outside.join("secret.txt"), "top secret").unwrap();

        let repo = temp_dir("dotdot-repo");
        let escaping_relative = format!(
            "../{}/secret.txt",
            outside.file_name().unwrap().to_str().unwrap()
        );

        assert!(resolve_workdir_file(repo.to_str().unwrap(), &escaping_relative).is_none());

        std::fs::remove_dir_all(&outside).ok();
        std::fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn resolve_workdir_file_returns_none_for_a_missing_path() {
        let dir = temp_dir("missing");
        assert!(resolve_workdir_file(dir.to_str().unwrap(), "nope.txt").is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    // ─── resolve_workdir_write_target ──────────────────────────────────────────

    #[test]
    fn write_target_allows_a_brand_new_file_directly_in_the_repo() {
        let dir = temp_dir("write-new-file");

        let resolved = resolve_workdir_write_target(dir.to_str().unwrap(), "new.txt").unwrap();
        assert_eq!(resolved, dir.canonicalize().unwrap().join("new.txt"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_target_allows_a_new_file_under_not_yet_existing_nested_dirs() {
        let dir = temp_dir("write-nested");

        let resolved =
            resolve_workdir_write_target(dir.to_str().unwrap(), "nested/deeper/new.txt").unwrap();
        assert_eq!(
            resolved,
            dir.canonicalize()
                .unwrap()
                .join("nested")
                .join("deeper")
                .join("new.txt")
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_target_overwrites_an_existing_in_repo_file() {
        let dir = temp_dir("write-overwrite");
        std::fs::write(dir.join("existing.txt"), "old").unwrap();

        let resolved = resolve_workdir_write_target(dir.to_str().unwrap(), "existing.txt").unwrap();
        assert_eq!(resolved, dir.canonicalize().unwrap().join("existing.txt"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    #[test]
    fn write_target_refuses_an_existing_symlink_escaping_the_repo() {
        let outside = temp_dir("write-existing-symlink-outside-target");
        std::fs::write(outside.join("victim.txt"), "original").unwrap();

        let repo = temp_dir("write-existing-symlink-repo");
        std::os::unix::fs::symlink(outside.join("victim.txt"), repo.join("notes.txt")).unwrap();

        assert!(resolve_workdir_write_target(repo.to_str().unwrap(), "notes.txt").is_none());

        std::fs::remove_dir_all(&outside).ok();
        std::fs::remove_dir_all(&repo).ok();
    }

    #[cfg(unix)]
    #[test]
    fn write_target_refuses_a_dangling_symlink_at_the_leaf() {
        // The exact issue #515 scenario: the path was a normal file, got discarded, and before
        // undo runs something replaces it with a symlink pointing somewhere that does not (yet)
        // exist — writing through it would still create the target file outside the repo.
        let repo = temp_dir("write-dangling-symlink-repo");
        let outside = temp_dir("write-dangling-symlink-outside");
        let escape_target = outside.join("does-not-exist-yet.txt");

        std::os::unix::fs::symlink(&escape_target, repo.join("notes.txt")).unwrap();

        assert!(resolve_workdir_write_target(repo.to_str().unwrap(), "notes.txt").is_none());
        assert!(
            !escape_target.exists(),
            "refusing the write must not create the symlink's target"
        );

        std::fs::remove_dir_all(&repo).ok();
        std::fs::remove_dir_all(&outside).ok();
    }

    #[cfg(unix)]
    #[test]
    fn write_target_refuses_a_new_file_under_a_symlinked_intermediate_directory() {
        let outside = temp_dir("write-symlinked-dir-outside");
        let repo = temp_dir("write-symlinked-dir-repo");
        std::os::unix::fs::symlink(&outside, repo.join("linked")).unwrap();

        assert!(resolve_workdir_write_target(repo.to_str().unwrap(), "linked/new.txt").is_none());
        assert!(
            !outside.join("new.txt").exists(),
            "refusing the write must not create anything through the symlinked directory"
        );

        std::fs::remove_dir_all(&outside).ok();
        std::fs::remove_dir_all(&repo).ok();
    }

    #[cfg(unix)]
    #[test]
    fn write_target_follows_an_existing_symlink_that_stays_inside_the_repo() {
        let dir = temp_dir("write-symlink-inside");
        std::fs::write(dir.join("real.txt"), "old").unwrap();
        std::os::unix::fs::symlink(dir.join("real.txt"), dir.join("link.txt")).unwrap();

        let resolved = resolve_workdir_write_target(dir.to_str().unwrap(), "link.txt").unwrap();
        assert_eq!(resolved, dir.canonicalize().unwrap().join("real.txt"));

        std::fs::remove_dir_all(&dir).ok();
    }
}
