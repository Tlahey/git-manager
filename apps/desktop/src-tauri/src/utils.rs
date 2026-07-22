use crate::error::AppError;
use crate::models::{GitCommit, GitSignature};
use git2::{Repository, Signature};

/// Shortens a full SHA-1 to 7 characters (or fewer if the SHA is shorter).
pub fn short_oid(sha: &str) -> String {
    sha[..7.min(sha.len())].to_string()
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
}
