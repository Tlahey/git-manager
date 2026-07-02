use crate::error::AppError;
use git2::{Repository, Signature};

/// Raccourcit un SHA-1 complet à 7 caractères (ou moins si le SHA est plus court).
pub fn short_oid(sha: &str) -> String {
    sha[..7.min(sha.len())].to_string()
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
