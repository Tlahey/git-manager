use crate::error::AppError;
use crate::models::{GitCommit, GitSignature};
use git2::{Repository, Signature};

/// Raccourcit un SHA-1 complet à 7 caractères (ou moins si le SHA est plus court).
pub fn short_oid(sha: &str) -> String {
    sha[..7.min(sha.len())].to_string()
}

/// Convertit un `git2::Commit` en modèle `GitCommit` sérialisable (même découpage
/// sujet/corps que `git_graph`).
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

/// Construit une signature git2 à partir de `user.name`/`user.email` de la config du repo,
/// avec les mêmes valeurs de repli utilisées partout dans le code (`"Unknown"` /
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

/// Turns a GitHub remote URL (`git@github.com:owner/repo.git` or
/// `https://github.com/owner/repo.git`) plus a commit OID into the commit's web URL.
/// Returns `None` if the remote isn't a recognizable GitHub URL.
pub fn github_web_url(remote_url: &str, oid: &str) -> Option<String> {
    let owner_repo = remote_url
        .strip_prefix("git@github.com:")
        .or_else(|| remote_url.strip_prefix("https://github.com/"))
        .or_else(|| remote_url.strip_prefix("http://github.com/"))?;

    let owner_repo = owner_repo.trim_end_matches('/').trim_end_matches(".git");
    if owner_repo.is_empty() || !owner_repo.contains('/') {
        return None;
    }

    Some(format!("https://github.com/{owner_repo}/commit/{oid}"))
}
