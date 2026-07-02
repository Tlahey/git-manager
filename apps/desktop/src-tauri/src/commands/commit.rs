use crate::error::AppError;
use crate::models::{GitDiff, GitDiffFile};
use crate::services::{git_commit, git_diff};
use git2::{DiffOptions, Oid, Repository};
use serde::Serialize;

pub use crate::services::git_commit::{CommitResult, DiscardResult};

// ─── stage_file ───────────────────────────────────────────────────────────────

/// Stage un fichier (ajouter à l'index)
#[tauri::command]
pub async fn stage_file(path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_commit::stage_file(&repo, &path, &file_path).map_err(Into::into)
}

// ─── unstage_file ─────────────────────────────────────────────────────────────

/// Unstage un fichier (retirer de l'index)
#[tauri::command]
pub async fn unstage_file(path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_commit::unstage_file(&repo, &file_path).map_err(Into::into)
}

// ─── discard_file_changes ─────────────────────────────────────────────────────

/// Discards all unstaged changes to a file in the working directory.
#[tauri::command]
pub async fn discard_file_changes(path: String, file_path: String) -> Result<DiscardResult, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_commit::discard_file_changes(&repo, &path, &file_path).map_err(Into::into)
}

// ─── stage_all ────────────────────────────────────────────────────────────────

/// Stage tous les fichiers modifiés
#[tauri::command]
pub async fn stage_all(path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_commit::stage_all(&repo).map_err(Into::into)
}

// ─── unstage_all ──────────────────────────────────────────────────────────────

/// Unstage tous les fichiers
#[tauri::command]
pub async fn unstage_all(path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_commit::unstage_all(&repo).map_err(Into::into)
}

// ─── create_commit ────────────────────────────────────────────────────────────

/// Crée un commit avec les fichiers staged. Retourne l'OID complet et le short OID.
#[tauri::command]
pub async fn create_commit(
    path: String,
    message: String,
    amend: Option<bool>,
    amend_oid: Option<String>,
) -> Result<CommitResult, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_commit::create_commit(&repo, &message, amend.unwrap_or(false), amend_oid.as_deref())
        .map_err(Into::into)
}

// ─── get_staged_diff ──────────────────────────────────────────────────────────

/// Retourne le diff des fichiers staged (pour la génération Ollama)
#[tauri::command]
pub async fn get_staged_diff(path: String) -> Result<GitDiff, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

    let head_tree = match repo.head() {
        Ok(head_ref) => {
            let head_commit = head_ref.peel_to_commit().map_err(AppError::Git)?;
            Some(head_commit.tree().map_err(AppError::Git)?)
        }
        Err(_) => None, // Repo initial sans commits
    };

    let diff = repo
        .diff_tree_to_index(head_tree.as_ref(), None, None)
        .map_err(AppError::Git)?;

    git_diff::build_diff(diff).map_err(|e| AppError::Git(e).into())
}

// ─── get_file_diff ────────────────────────────────────────────────────────────

/// Retourne le diff d'un fichier spécifique (staged, unstaged, ou d'un commit historique)
#[tauri::command]
pub async fn get_file_diff(
    path: String,
    file_path: String,
    staged: bool,
    oid: Option<String>,
) -> Result<GitDiffFile, String> {
    let full_diff = if let Some(oid_str) = oid {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        let commit_oid = Oid::from_str(&oid_str).map_err(AppError::Git)?;
        let commit = repo.find_commit(commit_oid).map_err(AppError::Git)?;

        let commit_tree = commit.tree().map_err(AppError::Git)?;
        let parent_tree = if commit.parent_count() > 0 {
            let parent = commit.parent(0).map_err(AppError::Git)?;
            Some(parent.tree().map_err(AppError::Git)?)
        } else {
            None
        };

        let mut diff_opts = DiffOptions::new();
        diff_opts.context_lines(3).ignore_whitespace_change(false);

        let diff = repo
            .diff_tree_to_tree(
                parent_tree.as_ref(),
                Some(&commit_tree),
                Some(&mut diff_opts),
            )
            .map_err(AppError::Git)?;

        git_diff::build_diff(diff).map_err(AppError::Git)?
    } else if staged {
        get_staged_diff(path).await?
    } else {
        workdir_diff(path).await?
    };

    full_diff
        .files
        .into_iter()
        .find(|f| f.new_path == file_path || f.old_path == file_path)
        .ok_or_else(|| {
            String::from(AppError::Unknown(format!(
                "File not found in diff: {file_path}"
            )))
        })
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async fn workdir_diff(path: String) -> Result<GitDiff, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let mut opts = DiffOptions::new();
    opts.include_untracked(false);

    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(AppError::Git)?;

    git_diff::build_diff(diff).map_err(|e| AppError::Git(e).into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawFileDiffContents {
    pub original: String,
    pub modified: String,
}

#[tauri::command]
pub async fn get_file_raw_contents(
    path: String,
    file_path: String,
    staged: bool,
    oid: Option<String>,
) -> Result<RawFileDiffContents, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;

    let original = if let Some(ref oid_str) = oid {
        let commit_oid = Oid::from_str(oid_str).map_err(|e| e.to_string())?;
        let commit = repo.find_commit(commit_oid).map_err(|e| e.to_string())?;
        if commit.parent_count() > 0 {
            let parent = commit.parent(0).map_err(|e| e.to_string())?;
            get_file_content_from_tree(&repo, &parent.tree().map_err(|e| e.to_string())?, &file_path)?
        } else {
            String::new()
        }
    } else if staged {
        if let Ok(head) = repo.head() {
            if let Ok(resolved) = head.resolve() {
                if let Ok(commit) = resolved.peel_to_commit() {
                    get_file_content_from_tree(&repo, &commit.tree().map_err(|e| e.to_string())?, &file_path).unwrap_or_default()
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        }
    } else {
        get_file_content_from_index(&repo, &file_path).unwrap_or_else(|_| {
            if let Ok(head) = repo.head() {
                if let Ok(resolved) = head.resolve() {
                    if let Ok(commit) = resolved.peel_to_commit() {
                        get_file_content_from_tree(&repo, &commit.tree().unwrap(), &file_path).unwrap_or_default()
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        })
    };

    let modified = if let Some(ref oid_str) = oid {
        let commit_oid = Oid::from_str(oid_str).map_err(|e| e.to_string())?;
        let commit = repo.find_commit(commit_oid).map_err(|e| e.to_string())?;
        get_file_content_from_tree(&repo, &commit.tree().map_err(|e| e.to_string())?, &file_path)?
    } else if staged {
        get_file_content_from_index(&repo, &file_path).unwrap_or_default()
    } else {
        let full_path = std::path::Path::new(&path).join(&file_path);
        match std::fs::read(&full_path) {
            Ok(bytes) => {
                if let Ok(content) = std::str::from_utf8(&bytes) {
                    content.to_string()
                } else {
                    String::from("[Binary Content]")
                }
            }
            Err(_) => String::new(),
        }
    };

    Ok(RawFileDiffContents { original, modified })
}

fn get_file_content_from_tree(repo: &Repository, tree: &git2::Tree, file_path: &str) -> Result<String, String> {
    if let Ok(entry) = tree.get_path(std::path::Path::new(file_path)) {
        if let Ok(blob) = repo.find_blob(entry.id()) {
            if blob.is_binary() {
                return Ok(String::from("[Binary Content]"));
            }
            if let Ok(content) = std::str::from_utf8(blob.content()) {
                return Ok(content.to_string());
            }
        }
    }
    Ok(String::new())
}

fn get_file_content_from_index(repo: &Repository, file_path: &str) -> Result<String, String> {
    let index = repo.index().map_err(|e| e.to_string())?;
    if let Some(entry) = index.get_path(std::path::Path::new(file_path), 0) {
        if let Ok(blob) = repo.find_blob(entry.id) {
            if blob.is_binary() {
                return Ok(String::from("[Binary Content]"));
            }
            if let Ok(content) = std::str::from_utf8(blob.content()) {
                return Ok(content.to_string());
            }
        }
    }
    Err(format!("File not found in index: {file_path}"))
}
