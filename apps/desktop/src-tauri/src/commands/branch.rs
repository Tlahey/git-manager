use crate::error::AppError;
use crate::models::GitBranch;
use crate::services::git_branch;
use git2::Repository;

pub use crate::services::git_branch::BranchRef;

// ─── Commandes Tauri ──────────────────────────────────────────────────────────

/// Retourne la liste des branches (locales et/ou distantes)
#[tauri::command]
pub async fn get_branches(
    path: String,
    include_remote: Option<bool>,
) -> Result<Vec<GitBranch>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_branch::list_branches(&repo, include_remote.unwrap_or(true)).map_err(Into::into)
}

/// Retourne la liste de tous les tags du dépôt
#[tauri::command]
pub async fn get_tags(path: String) -> Result<Vec<BranchRef>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_branch::list_tags(&repo).map_err(Into::into)
}

/// Retourne le tag (nom court) le plus ancien dont l'historique contient `oid` — la première
/// release dans laquelle le commit a été livré — ou `None` si aucun tag ne le contient.
#[tauri::command]
pub async fn get_tag_containing_commit(
    path: String,
    oid: String,
) -> Result<Option<String>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_branch::first_tag_containing_commit(&repo, &oid).map_err(Into::into)
}

/// Indique si `oid` appartient à l'historique de la branche courante (HEAD ou un
/// de ses ancêtres) — utilisé pour n'activer le fixup que sur les commits rebasables.
#[tauri::command]
pub async fn is_commit_on_current_branch(path: String, oid: String) -> Result<bool, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_branch::is_commit_on_current_branch(&repo, &oid).map_err(Into::into)
}

/// Crée une nouvelle branche locale pointant sur `from_ref` (nom de branche, "HEAD", ou OID), sans checkout.
#[tauri::command]
pub async fn create_branch(path: String, name: String, from_ref: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_branch::create_branch(&repo, &name, &from_ref).map_err(Into::into)
}

/// Crée un tag pointant sur `from_ref` — léger si `message` est absent, annoté sinon.
#[tauri::command]
pub async fn create_tag(
    path: String,
    name: String,
    from_ref: String,
    message: Option<String>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    match message {
        Some(message) => git_branch::create_tag_annotated(&repo, &name, &from_ref, &message),
        None => git_branch::create_tag_lightweight(&repo, &name, &from_ref),
    }
    .map_err(Into::into)
}

/// Supprime un tag (léger ou annoté) par son nom court.
#[tauri::command]
pub async fn delete_tag(path: String, name: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_branch::delete_tag(&repo, &name).map_err(Into::into)
}

/// Checkout d'une branche locale par son nom, ou d'un commit brut par OID (HEAD détaché).
/// Le fallback OID permet de restaurer un HEAD détaché lors d'un undo de checkout.
#[tauri::command]
pub async fn checkout_branch(
    path: String,
    ref_name: String,
    force: Option<bool>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_branch::checkout_branch(&repo, &ref_name, force.unwrap_or(false)).map_err(Into::into)
}

/// Supprime une branche locale (et sa branche de tracking distante si demandé).
/// `force = false` refuse la suppression si la branche n'est pas fusionnée dans HEAD
/// (équivalent `git branch -d`) ; `force = true` supprime sans vérification (`-D`).
#[tauri::command]
pub async fn delete_branch(
    path: String,
    name: String,
    force: Option<bool>,
    delete_remote: Option<bool>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_branch::delete_branch(
        &repo,
        &name,
        force.unwrap_or(false),
        delete_remote.unwrap_or(false),
    )
    .map_err(Into::into)
}
