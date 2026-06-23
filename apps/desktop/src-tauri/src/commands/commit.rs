use crate::error::AppError;
use git2::{DiffOptions, Repository};
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::path::Path;
use std::sync::{Arc, Mutex};

// ─── Structs locales (miroir des types TypeScript GitDiff / GitDiffFile) ──────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DiffLine {
    origin: String,
    content: String,
    old_lineno: Option<i32>,
    new_lineno: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DiffHunk {
    header: String,
    lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffFile {
    pub old_path: String,
    pub new_path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub hunks: Vec<DiffHunk>,
    pub is_binary: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub files: Vec<GitDiffFile>,
    pub total_additions: usize,
    pub total_deletions: usize,
}

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

/// Crée un commit avec les fichiers staged. Retourne le short OID.
#[tauri::command]
pub async fn create_commit(
    path: String,
    message: String,
    amend: Option<bool>,
) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

    // Auteur depuis la config git locale
    let config = repo.config().map_err(AppError::Git)?;
    let author_name = config
        .get_string("user.name")
        .unwrap_or_else(|_| "Unknown".to_string());
    let author_email = config
        .get_string("user.email")
        .unwrap_or_else(|_| "unknown@unknown.com".to_string());

    let sig = git2::Signature::now(&author_name, &author_email).map_err(AppError::Git)?;

    let mut index = repo.index().map_err(AppError::Git)?;
    let tree_oid = index.write_tree().map_err(AppError::Git)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;

    let do_amend = amend.unwrap_or(false);

    let oid = if do_amend {
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

    // Retourner le short SHA (7 caractères)
    let full_sha = oid.to_string();
    Ok(full_sha[..7.min(full_sha.len())].to_string())
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

/// Retourne le diff d'un fichier spécifique (staged ou unstaged)
#[tauri::command]
pub async fn get_file_diff(
    path: String,
    file_path: String,
    staged: bool,
) -> Result<GitDiffFile, String> {
    let full_diff = if staged {
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
                file.hunks.push(DiffHunk {
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
                    hunk.lines.push(DiffLine {
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
