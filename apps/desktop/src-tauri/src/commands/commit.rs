use crate::error::AppError;
use crate::models::{GitDiff, GitDiffFile, GitDiffHunk, GitDiffLine};
use crate::utils::{get_git_signature, short_oid};
use git2::{DiffOptions, Oid, Repository};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::path::Path;
use std::sync::{Arc, Mutex};

// ─── stage_file ───────────────────────────────────────────────────────────────

/// Stage un fichier (ajouter à l'index)
#[tauri::command]
pub async fn stage_file(path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let mut index = repo.index().map_err(AppError::Git)?;

    let abs_path = Path::new(&path).join(&file_path);
    if abs_path.exists() {
        index
            .add_path(Path::new(&file_path))
            .map_err(AppError::Git)?;
    } else {
        // Fichier supprimé : le retirer de l'index
        index
            .remove_path(Path::new(&file_path))
            .map_err(AppError::Git)?;
    }

    index.write().map_err(AppError::Git)?;
    Ok(())
}

// ─── unstage_file ─────────────────────────────────────────────────────────────

/// Unstage un fichier (retirer de l'index)
#[tauri::command]
pub async fn unstage_file(path: String, file_path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

    match repo.head() {
        Ok(head_ref) => {
            let head_commit = head_ref.peel_to_commit().map_err(AppError::Git)?;
            let obj = head_commit.as_object();
            repo.reset_default(Some(obj), [file_path.as_str()])
                .map_err(AppError::Git)?;
        }
        Err(_) => {
            // Repo initial sans commits : retirer directement de l'index
            let mut index = repo.index().map_err(AppError::Git)?;
            index
                .remove_path(Path::new(&file_path))
                .map_err(AppError::Git)?;
            index.write().map_err(AppError::Git)?;
        }
    }

    Ok(())
}

// ─── discard_file_changes ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscardResult {
    /// OID d'un blob orphelin contenant le contenu du fichier avant le discard (pour undo).
    /// `None` si le fichier n'existait pas sur disque (ex. déjà vide) ou était un dossier.
    pub snapshot_blob_oid: Option<String>,
    pub was_untracked: bool,
    pub was_staged: bool,
}

/// Discards all unstaged changes to a file in the working directory.
#[tauri::command]
pub async fn discard_file_changes(path: String, file_path: String) -> Result<DiscardResult, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

    // Check if the file is untracked
    let status = repo.status_file(Path::new(&file_path)).ok();
    let is_untracked = status.map(|s| s.is_wt_new() || s.is_index_new()).unwrap_or(false);
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
    let full_path = Path::new(&path).join(&file_path);
    let snapshot_blob_oid = if full_path.is_file() {
        let bytes = std::fs::read(&full_path).map_err(|e| e.to_string())?;
        Some(repo.blob(&bytes).map_err(AppError::Git)?.to_string())
    } else {
        None
    };

    if is_untracked {
        if full_path.exists() {
            if full_path.is_dir() {
                std::fs::remove_dir_all(&full_path).map_err(|e| e.to_string())?;
            } else {
                std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;
            }
        }
        // Also remove from index if it was staged as new
        let mut index = repo.index().map_err(AppError::Git)?;
        let _ = index.remove_path(Path::new(&file_path));
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
            let _ = repo.reset_default(Some(obj), [&file_path]);
        }
    } else {
        let mut index = repo.index().map_err(AppError::Git)?;
        let _ = index.remove_path(Path::new(&file_path));
        let _ = index.write();
    }

    // Now checkout the file to discard working directory changes
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.force();
    checkout_opts.path(&file_path);

    repo.checkout_index(None, Some(&mut checkout_opts))
        .map_err(|e| e.to_string())?;

    Ok(DiscardResult {
        snapshot_blob_oid,
        was_untracked: false,
        was_staged,
    })
}


// ─── stage_all ────────────────────────────────────────────────────────────────

/// Stage tous les fichiers modifiés
#[tauri::command]
pub async fn stage_all(path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let mut index = repo.index().map_err(AppError::Git)?;

    index
        .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(AppError::Git)?;
    index.write().map_err(AppError::Git)?;

    Ok(())
}

// ─── unstage_all ──────────────────────────────────────────────────────────────

/// Unstage tous les fichiers
#[tauri::command]
pub async fn unstage_all(path: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

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
                repo.reset_default(
                    Some(obj),
                    collected.iter().map(|s| s.as_str()),
                )
                .map_err(AppError::Git)?;
            }
        }
        Err(_) => {
            // Repo initial sans commits : vider l'index
            let mut index = repo.index().map_err(AppError::Git)?;
            index.clear().map_err(AppError::Git)?;
            index.write().map_err(AppError::Git)?;
        }
    }

    Ok(())
}

// ─── create_commit ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub oid: String,
    pub short_oid: String,
}

/// Crée un commit avec les fichiers staged. Retourne l'OID complet et le short OID.
#[tauri::command]
pub async fn create_commit(
    path: String,
    message: String,
    amend: Option<bool>,
    amend_oid: Option<String>,
) -> Result<CommitResult, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

    // Auteur depuis la config git locale
    let sig = get_git_signature(&repo)?;

    let mut index = repo.index().map_err(AppError::Git)?;
    let tree_oid = index.write_tree().map_err(AppError::Git)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;

    let do_amend = amend.unwrap_or(false);
    let amend_oid_str = amend_oid.as_deref();

    let oid = if do_amend && amend_oid_str.is_some() {
        // Amend d'un commit spécifique - crée un nouveau commit avec le nouveau message
        let target_oid = Oid::from_str(amend_oid_str.unwrap()).map_err(AppError::Git)?;
        let target_commit = repo.find_commit(target_oid).map_err(AppError::Git)?;

        // Créer un nouveau commit avec le nouveau message et les mêmes parents
        let parents: Vec<git2::Commit> = target_commit.parents().collect();
        
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        repo.commit(
            None,
            &sig,
            &sig,
            &message,
            &tree,
            &parent_refs,
        ).map_err(AppError::Git)?
    } else if do_amend {
        // Amend du HEAD (comportement existant)
        let head = repo.head().map_err(AppError::Git)?;
        let head_oid = head
            .target()
            .ok_or_else(|| String::from(AppError::Unknown("HEAD has no target".to_string())))?;
        let head_commit = repo.find_commit(head_oid).map_err(AppError::Git)?;

        head_commit
            .amend(
                Some("HEAD"),
                Some(&sig),
                Some(&sig),
                None,
                Some(&message),
                Some(&tree),
            )
            .map_err(AppError::Git)?
    } else {
        let parents: Vec<git2::Commit> = match repo.head() {
            Ok(head_ref) => {
                let parent_oid = head_ref.target().ok_or_else(|| {
                    String::from(AppError::Unknown("HEAD has no target".to_string()))
                })?;
                vec![repo.find_commit(parent_oid).map_err(AppError::Git)?]
            }
            Err(_) => vec![], // Commit initial
        };

        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parent_refs)
            .map_err(AppError::Git)?
    };

    let full_sha = oid.to_string();
    let short_sha = short_oid(&full_sha);
    Ok(CommitResult {
        oid: full_sha,
        short_oid: short_sha,
    })
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

    build_diff(diff)
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

        build_diff(diff)?
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

    build_diff(diff)
}

fn build_diff(diff: git2::Diff) -> Result<GitDiff, String> {
    let files: RefCell<Vec<GitDiffFile>> = RefCell::new(Vec::new());

    diff.foreach(
        &mut |delta, _progress| {
            let old_path = delta
                .old_file()
                .path()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();
            let new_path = delta
                .new_file()
                .path()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();
            let status = match delta.status() {
                git2::Delta::Added => "added",
                git2::Delta::Deleted => "deleted",
                git2::Delta::Modified => "modified",
                git2::Delta::Renamed => "renamed",
                git2::Delta::Copied => "copied",
                _ => "modified",
            };
            let is_binary =
                delta.old_file().is_binary() || delta.new_file().is_binary();

            files.borrow_mut().push(GitDiffFile {
                old_path,
                new_path,
                status: status.to_string(),
                additions: 0,
                deletions: 0,
                hunks: Vec::new(),
                is_binary,
            });
            true
        },
        None,
        Some(&mut |_delta, hunk| {
            let header = std::str::from_utf8(hunk.header())
                .unwrap_or("")
                .trim_end_matches('\n')
                .to_string();
            if let Some(file) = files.borrow_mut().last_mut() {
                file.hunks.push(GitDiffHunk {
                    header,
                    lines: Vec::new(),
                });
            }
            true
        }),
        Some(&mut |_delta, _hunk, line| {
            let content = std::str::from_utf8(line.content())
                .unwrap_or("")
                .trim_end_matches('\n')
                .to_string();
            let origin = match line.origin() {
                '+' => "+",
                '-' => "-",
                ' ' => " ",
                _ => "\\",
            };
            let mut f = files.borrow_mut();
            if let Some(file) = f.last_mut() {
                match origin {
                    "+" => file.additions += 1,
                    "-" => file.deletions += 1,
                    _ => {}
                }
                if let Some(hunk) = file.hunks.last_mut() {
                    hunk.lines.push(GitDiffLine {
                        origin: origin.to_string(),
                        content,
                        old_lineno: line.old_lineno().map(|n| n as i32),
                        new_lineno: line.new_lineno().map(|n| n as i32),
                    });
                }
            }
            true
        }),
    )
    .map_err(AppError::Git)?;

    let files_out = files.into_inner();
    let total_additions = files_out.iter().map(|f| f.additions).sum();
    let total_deletions = files_out.iter().map(|f| f.deletions).sum();

    Ok(GitDiff {
        files: files_out,
        total_additions,
        total_deletions,
    })
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
