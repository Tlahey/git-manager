use crate::error::AppError;
use git2::{IndexAddOption, Oid, Repository};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const PIN_NAMESPACE: &str = "refs/git-manager/undo/";

fn pin_ref_name(ref_name: &str) -> String {
    format!("{PIN_NAMESPACE}{ref_name}")
}

fn pin_oid(repo: &Repository, ref_name: &str, oid: Oid) -> Result<(), git2::Error> {
    repo.reference(
        &pin_ref_name(ref_name),
        oid,
        true,
        "git-manager: pin for undo history",
    )?;
    Ok(())
}

// ─── Épinglage générique (utilisé pour protéger un objet déjà existant, ex. le
// commit d'un stash avant pop/drop) ────────────────────────────────────────────

/// Crée/écrase une ref cachée (`refs/git-manager/undo/<ref_name>`) pointant sur `oid`, pour
/// empêcher le `git gc` de la nettoyer tant que l'entrée d'historique correspondante existe.
/// Fonctionne pour un OID de blob, tree ou commit indifféremment.
#[tauri::command]
pub async fn pin_object(path: String, ref_name: String, oid: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let target_oid = Oid::from_str(&oid).map_err(|_| "Invalid OID".to_string())?;
    pin_oid(&repo, &ref_name, target_oid).map_err(AppError::Git)?;
    Ok(())
}

/// Supprime une ref cachée créée par `pin_object`/les commandes de snapshot. Idempotent —
/// pas d'erreur si la ref n'existe déjà plus.
#[tauri::command]
pub async fn unpin_object(path: String, ref_name: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    if let Ok(mut reference) = repo.find_reference(&pin_ref_name(&ref_name)) {
        let _ = reference.delete();
    }
    Ok(())
}

/// Vérifie l'existence de chaque OID dans la base d'objets locale (sans charger leur contenu).
/// Utilisé au démarrage pour invalider les entrées d'historique persistées dont l'objet a
/// disparu (ex. `git gc` manuel exécuté en dehors de l'app).
#[tauri::command]
pub async fn objects_exist(path: String, oids: Vec<String>) -> Result<Vec<bool>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let odb = repo.odb().map_err(AppError::Git)?;
    let results = oids
        .iter()
        .map(|oid_str| {
            Oid::from_str(oid_str)
                .map(|oid| odb.exists(oid))
                .unwrap_or(false)
        })
        .collect();
    Ok(results)
}

// ─── Fichier orphelin (utilisé avant discard_file_changes) ───────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshotResult {
    pub blob_oid: String,
    pub ref_name: String,
}

/// Écrit le contenu d'un fichier en blob Git et épingle immédiatement l'objet via une ref
/// cachée (`refs/git-manager/undo/<entry_id>`) pour qu'il survive indéfiniment tant que
/// l'entrée d'historique existe. Retourne `None` si le fichier n'existe pas (rien à sauvegarder).
#[tauri::command]
pub async fn snapshot_file(
    path: String,
    file_path: String,
    entry_id: String,
) -> Result<Option<FileSnapshotResult>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let full_path = Path::new(&path).join(&file_path);

    if !full_path.is_file() {
        return Ok(None);
    }

    let bytes = fs::read(&full_path).map_err(|e| e.to_string())?;
    let oid = repo.blob(&bytes).map_err(AppError::Git)?;
    pin_oid(&repo, &entry_id, oid).map_err(AppError::Git)?;

    Ok(Some(FileSnapshotResult {
        blob_oid: oid.to_string(),
        ref_name: entry_id,
    }))
}

/// Réécrit un fichier sur disque depuis un blob orphelin capturé par `snapshot_file`.
#[tauri::command]
pub async fn restore_file_blob(
    path: String,
    file_path: String,
    blob_oid: String,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let oid = Oid::from_str(&blob_oid).map_err(|_| "Invalid blob OID".to_string())?;
    let blob = repo.find_blob(oid).map_err(AppError::Git)?;

    let full_path = Path::new(&path).join(&file_path);
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full_path, blob.content()).map_err(|e| e.to_string())?;

    Ok(())
}

// ─── Snapshot complet du worktree (utilisé avant reset hard / checkout forcé / stash pop-apply) ─

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeSnapshot {
    pub index_tree_oid: String,
    pub workdir_tree_oid: String,
    pub index_ref_name: String,
    pub workdir_ref_name: String,
}

fn build_worktree_snapshot(
    repo: &Repository,
    entry_id: &str,
) -> Result<WorktreeSnapshot, git2::Error> {
    let index_tree_oid = {
        let mut index = repo.index()?;
        index.write_tree()?
    };

    let workdir_tree_oid = {
        let mut index = repo.index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.write_tree()?
    };

    let index_ref_name = format!("{entry_id}/index");
    let workdir_ref_name = format!("{entry_id}/workdir");
    pin_oid(repo, &index_ref_name, index_tree_oid)?;
    pin_oid(repo, &workdir_ref_name, workdir_tree_oid)?;

    Ok(WorktreeSnapshot {
        index_tree_oid: index_tree_oid.to_string(),
        workdir_tree_oid: workdir_tree_oid.to_string(),
        index_ref_name,
        workdir_ref_name,
    })
}

/// Capture l'état courant de l'index (staged) et du working directory (staged + unstaged +
/// untracked) sous forme de deux trees Git, épinglés via des refs cachées. Retourne `None` si
/// le repo est déjà propre (rien à protéger avant une action destructive comme reset --hard ou
/// checkout forcé).
#[tauri::command]
pub async fn snapshot_worktree(
    path: String,
    entry_id: String,
) -> Result<Option<WorktreeSnapshot>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

    let mut status_opts = git2::StatusOptions::new();
    status_opts
        .include_untracked(true)
        .recurse_untracked_dirs(true);
    let statuses = repo
        .statuses(Some(&mut status_opts))
        .map_err(AppError::Git)?;
    if statuses.is_empty() {
        return Ok(None);
    }

    build_worktree_snapshot(&repo, &entry_id)
        .map(Some)
        .map_err(AppError::Git)
        .map_err(String::from)
}

/// Comme `snapshot_worktree`, mais capture toujours (même si le workdir est propre) — utilisé
/// pour l'undo de stash apply/pop, où la baseline "propre" est elle-même l'état à restaurer.
#[tauri::command]
pub async fn snapshot_worktree_always(
    path: String,
    entry_id: String,
) -> Result<WorktreeSnapshot, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    build_worktree_snapshot(&repo, &entry_id)
        .map_err(AppError::Git)
        .map_err(String::from)
}

/// Restaure un snapshot capturé par `snapshot_worktree` : le working directory est remis
/// dans l'état exact du tree "workdir" (untracked superflus supprimés), et l'index est remis
/// dans l'état exact du tree "index" (préserve la distinction staged/unstaged d'origine).
#[tauri::command]
pub async fn restore_worktree_snapshot(
    path: String,
    index_tree_oid: String,
    workdir_tree_oid: String,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

    let workdir_oid =
        Oid::from_str(&workdir_tree_oid).map_err(|_| "Invalid workdir tree OID".to_string())?;
    let workdir_tree = repo.find_tree(workdir_oid).map_err(AppError::Git)?;

    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.force();
    checkout_opts.remove_untracked(true);
    repo.checkout_tree(workdir_tree.as_object(), Some(&mut checkout_opts))
        .map_err(AppError::Git)?;

    let index_oid =
        Oid::from_str(&index_tree_oid).map_err(|_| "Invalid index tree OID".to_string())?;
    let index_tree = repo.find_tree(index_oid).map_err(AppError::Git)?;
    let mut index = repo.index().map_err(AppError::Git)?;
    index.read_tree(&index_tree).map_err(AppError::Git)?;
    index.write().map_err(AppError::Git)?;

    Ok(())
}

// ─── recreate_branch_ref (utilisé pour l'undo de delete_branch) ──────────────

/// Recrée une ref de branche locale pointant vers un OID donné, avec upstream optionnel.
/// Utilitaire interne à l'undo de `delete_branch` — n'implémente pas la commande générique
/// `create_branch` attendue ailleurs par l'UI (hors scope, cf. plan).
#[tauri::command]
pub async fn recreate_branch_ref(
    path: String,
    name: String,
    oid: String,
    upstream: Option<String>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let target_oid = Oid::from_str(&oid).map_err(|_| "Invalid commit OID".to_string())?;
    let commit = repo.find_commit(target_oid).map_err(AppError::Git)?;
    let mut branch = repo.branch(&name, &commit, false).map_err(AppError::Git)?;

    if let Some(upstream_name) = upstream {
        let _ = branch.set_upstream(Some(&upstream_name));
    }

    Ok(())
}
