use crate::error::AppError;
use crate::utils::{get_git_signature, short_oid};
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscardResult {
    /// OID d'un blob orphelin contenant le contenu du fichier avant le discard (pour undo).
    /// `None` si le fichier n'existait pas sur disque (ex. déjà vide) ou était un dossier.
    pub snapshot_blob_oid: Option<String>,
    pub was_untracked: bool,
    pub was_staged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub oid: String,
    pub short_oid: String,
}

/// Stage un fichier (ajouter à l'index), ou le retire de l'index s'il a été supprimé sur disque.
pub fn stage_file(repo: &Repository, repo_path: &str, file_path: &str) -> Result<(), AppError> {
    let mut index = repo.index().map_err(AppError::Git)?;

    let abs_path = Path::new(repo_path).join(file_path);
    if abs_path.exists() {
        index
            .add_path(Path::new(file_path))
            .map_err(AppError::Git)?;
    } else {
        // Fichier supprimé : le retirer de l'index
        index
            .remove_path(Path::new(file_path))
            .map_err(AppError::Git)?;
    }

    index.write().map_err(AppError::Git)
}

/// Unstage un fichier (retirer de l'index).
pub fn unstage_file(repo: &Repository, file_path: &str) -> Result<(), AppError> {
    match repo.head() {
        Ok(head_ref) => {
            let head_commit = head_ref.peel_to_commit().map_err(AppError::Git)?;
            let obj = head_commit.as_object();
            repo.reset_default(Some(obj), [file_path])
                .map_err(AppError::Git)
        }
        Err(_) => {
            // Repo initial sans commits : retirer directement de l'index
            let mut index = repo.index().map_err(AppError::Git)?;
            index
                .remove_path(Path::new(file_path))
                .map_err(AppError::Git)?;
            index.write().map_err(AppError::Git)
        }
    }
}

/// Discards all unstaged changes to a file in the working directory.
pub fn discard_file_changes(
    repo: &Repository,
    repo_path: &str,
    file_path: &str,
) -> Result<DiscardResult, AppError> {
    // Check if the file is untracked
    let status = repo.status_file(Path::new(file_path)).ok();
    let is_untracked = status
        .map(|s| s.is_wt_new() || s.is_index_new())
        .unwrap_or(false);
    let was_staged = status
        .map(|s| {
            s.is_index_new()
                || s.is_index_modified()
                || s.is_index_deleted()
                || s.is_index_renamed()
                || s.is_index_typechange()
        })
        .unwrap_or(false);

    // Snapshot du contenu actuel (fichier régulier uniquement) avant toute modification,
    // pour permettre un undo fidèle du discard.
    let full_path = Path::new(repo_path).join(file_path);
    let snapshot_blob_oid = if full_path.is_file() {
        let bytes = std::fs::read(&full_path).map_err(AppError::Io)?;
        Some(repo.blob(&bytes).map_err(AppError::Git)?.to_string())
    } else {
        None
    };

    if is_untracked {
        if full_path.exists() {
            if full_path.is_dir() {
                std::fs::remove_dir_all(&full_path).map_err(AppError::Io)?;
            } else {
                std::fs::remove_file(&full_path).map_err(AppError::Io)?;
            }
        }
        // Also remove from index if it was staged as new
        let mut index = repo.index().map_err(AppError::Git)?;
        let _ = index.remove_path(Path::new(file_path));
        let _ = index.write();
        return Ok(DiscardResult {
            snapshot_blob_oid,
            was_untracked: true,
            was_staged,
        });
    }

    // Otherwise, unstage it first if it is staged
    if let Ok(head_ref) = repo.head() {
        if let Ok(head_commit) = head_ref.peel_to_commit() {
            let obj = head_commit.as_object();
            let _ = repo.reset_default(Some(obj), [file_path]);
        }
    } else {
        let mut index = repo.index().map_err(AppError::Git)?;
        let _ = index.remove_path(Path::new(file_path));
        let _ = index.write();
    }

    // Now checkout the file to discard working directory changes
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.force();
    checkout_opts.path(file_path);

    repo.checkout_index(None, Some(&mut checkout_opts))
        .map_err(AppError::Git)?;

    Ok(DiscardResult {
        snapshot_blob_oid,
        was_untracked: false,
        was_staged,
    })
}

/// Stage tous les fichiers modifiés.
pub fn stage_all(repo: &Repository) -> Result<(), AppError> {
    let mut index = repo.index().map_err(AppError::Git)?;

    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(AppError::Git)?;
    index.write().map_err(AppError::Git)
}

/// Unstage tous les fichiers.
pub fn unstage_all(repo: &Repository) -> Result<(), AppError> {
    match repo.head() {
        Ok(head_ref) => {
            let head_commit = head_ref.peel_to_commit().map_err(AppError::Git)?;
            let head_tree = head_commit.tree().map_err(AppError::Git)?;
            let index = repo.index().map_err(AppError::Git)?;

            // Collecter tous les chemins stagés
            let diff = repo
                .diff_tree_to_index(Some(&head_tree), Some(&index), None)
                .map_err(AppError::Git)?;

            let paths: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
            let paths_clone = Arc::clone(&paths);

            diff.foreach(
                &mut |delta, _| {
                    let p = delta
                        .new_file()
                        .path()
                        .or_else(|| delta.old_file().path())
                        .and_then(|p| p.to_str())
                        .unwrap_or("")
                        .to_string();
                    paths_clone.lock().unwrap().push(p);
                    true
                },
                None,
                None,
                None,
            )
            .map_err(AppError::Git)?;

            let collected = paths.lock().unwrap().clone();
            if !collected.is_empty() {
                let obj = head_commit.as_object();
                repo.reset_default(Some(obj), collected.iter().map(|s| s.as_str()))
                    .map_err(AppError::Git)?;
            }
            Ok(())
        }
        Err(_) => {
            // Repo initial sans commits : vider l'index
            let mut index = repo.index().map_err(AppError::Git)?;
            index.clear().map_err(AppError::Git)?;
            index.write().map_err(AppError::Git)
        }
    }
}

/// Crée un commit avec les fichiers staged (ou amend un commit existant). Retourne l'OID
/// complet et le short OID.
pub fn create_commit(
    repo: &Repository,
    message: &str,
    amend: bool,
    amend_oid: Option<&str>,
) -> Result<CommitResult, AppError> {
    let sig = get_git_signature(repo)?;

    let mut index = repo.index().map_err(AppError::Git)?;
    let tree_oid = index.write_tree().map_err(AppError::Git)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;

    let oid = if amend && amend_oid.is_some() {
        // Amend d'un commit spécifique - crée un nouveau commit avec le nouveau message
        let target_oid = git2::Oid::from_str(amend_oid.unwrap()).map_err(AppError::Git)?;
        let target_commit = repo.find_commit(target_oid).map_err(AppError::Git)?;

        // Créer un nouveau commit avec le nouveau message et les mêmes parents
        let parents: Vec<git2::Commit> = target_commit.parents().collect();
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        repo.commit(None, &sig, &sig, message, &tree, &parent_refs)
            .map_err(AppError::Git)?
    } else if amend {
        // Amend du HEAD (comportement existant)
        let head = repo.head().map_err(AppError::Git)?;
        let head_oid = head
            .target()
            .ok_or_else(|| AppError::Unknown("HEAD has no target".to_string()))?;
        let head_commit = repo.find_commit(head_oid).map_err(AppError::Git)?;

        head_commit
            .amend(
                Some("HEAD"),
                Some(&sig),
                Some(&sig),
                None,
                Some(message),
                Some(&tree),
            )
            .map_err(AppError::Git)?
    } else {
        let parents: Vec<git2::Commit> = match repo.head() {
            Ok(head_ref) => {
                let parent_oid = head_ref
                    .target()
                    .ok_or_else(|| AppError::Unknown("HEAD has no target".to_string()))?;
                vec![repo.find_commit(parent_oid).map_err(AppError::Git)?]
            }
            Err(_) => vec![], // Commit initial
        };

        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
            .map_err(AppError::Git)?
    };

    let full_sha = oid.to_string();
    Ok(CommitResult {
        short_oid: short_oid(&full_sha),
        oid: full_sha,
    })
}
