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

/// Merges branch `source` into `target` (drag-and-drop of one ref badge onto another).
///
/// `target` is checked out, then `git merge --no-edit source` runs. On conflict the merge is
/// **aborted** (`git merge --abort`) and the error is surfaced: unlike rebase, the app has no UI
/// yet to drive a merge-conflict resolution (the conflict panel is driven by rebase state, see
/// `git_rebase::get_rebase_state`), so leaving the repo stuck in a `MERGE_HEAD` state with no way
/// out would be worse than refusing cleanly.
#[tauri::command]
pub async fn merge_branch(
    path: String,
    source: String,
    target: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let checkout = app
        .shell()
        .command("git")
        .args(["-C", &path, "checkout", &target])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !checkout.status.success() {
        return Err(String::from_utf8_lossy(&checkout.stderr).to_string());
    }

    let merge = app
        .shell()
        .command("git")
        .args(["-C", &path, "merge", "--no-edit", &source])
        .env("GIT_EDITOR", "true")
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !merge.status.success() {
        // Restore a clean state — the app can't drive merge-conflict resolution yet.
        let _ = app
            .shell()
            .command("git")
            .args(["-C", &path, "merge", "--abort"])
            .output()
            .await;
        return Err(String::from_utf8_lossy(&merge.stderr).to_string());
    }
    Ok(())
}

/// Advances branch `target` up to `source` (fast-forward only — rejected if `target` isn't an
/// ancestor of `source`). If `target` is the current branch, `git merge --ff-only` also updates the
/// working tree; otherwise the ref is moved without touching the worktree (`git branch -f`, safe
/// since `target` isn't checked out).
#[tauri::command]
pub async fn fast_forward_branch(
    path: String,
    source: String,
    target: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    // `git merge-base --is-ancestor target source` exits 0 iff target is reachable from source,
    // i.e. the update is a genuine fast-forward.
    let ancestor = app
        .shell()
        .command("git")
        .args(["-C", &path, "merge-base", "--is-ancestor", &target, &source])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !ancestor.status.success() {
        return Err(AppError::InvalidInput(format!(
            "{target} is not an ancestor of {source}; fast-forward is not possible"
        ))
        .into());
    }

    let current = app
        .shell()
        .command("git")
        .args(["-C", &path, "symbolic-ref", "--quiet", "--short", "HEAD"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let current_branch = String::from_utf8_lossy(&current.stdout).trim().to_string();

    let output = if current.status.success() && current_branch == target {
        app.shell()
            .command("git")
            .args(["-C", &path, "merge", "--ff-only", &source])
            .output()
            .await
    } else {
        app.shell()
            .command("git")
            .args(["-C", &path, "branch", "-f", &target, &source])
            .output()
            .await
    }
    .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
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
