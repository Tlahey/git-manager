use crate::error::AppError;
use crate::models::RebaseState;
use crate::services::git_rebase;
use git2::Repository;

/// Returns the repository's current rebase state (idle, in progress, paused on a
/// conflict, or paused on an edit/reword step), for the toolbar's "REBASING" indicator.
#[tauri::command]
pub async fn get_rebase_state(path: String) -> Result<RebaseState, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_rebase::get_rebase_state(&repo).map_err(Into::into)
}

/// Rebases the current branch onto `target_oid` — a plain, non-interactive
/// `git rebase <target_oid>`. Conflicts (if any) leave the repo in the normal
/// `.git/rebase-merge` state already surfaced by `get_rebase_state`.
#[tauri::command]
pub async fn rebase_onto_commit(
    path: String,
    target_oid: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let output = app
        .shell()
        .command("git")
        .args(["-C", &path, "rebase", &target_oid])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

/// Continues a paused rebase (`git rebase --continue`). `GIT_EDITOR=true` accepts
/// whatever commit message is already staged rather than prompting.
#[tauri::command]
pub async fn continue_rebase(path: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let output = app
        .shell()
        .command("git")
        .args(["-C", &path, "rebase", "--continue"])
        .env("GIT_EDITOR", "true")
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

/// Aborts a paused rebase (`git rebase --abort`), restoring the original HEAD.
#[tauri::command]
pub async fn abort_rebase(path: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let output = app
        .shell()
        .command("git")
        .args(["-C", &path, "rebase", "--abort"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}
