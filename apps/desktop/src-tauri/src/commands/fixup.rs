use crate::error::AppError;
use crate::services::git_commit::CommitResult;
use crate::services::git_fixup;
use git2::Repository;

pub use crate::services::git_fixup::{AutosquashGroup, FixupInfo};

// ─── create_fixup_commit ──────────────────────────────────────────────────────

/// Creates a fixup! commit for the target commit from the current staged changes.
/// `message` optionally overrides the generated `fixup! <subject>` message.
/// Returns the full + short OID of the new fixup commit.
#[tauri::command]
pub async fn create_fixup_commit(
    path: String,
    target_oid: String,
    message: Option<String>,
) -> Result<CommitResult, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_fixup::create_fixup_commit(&repo, &target_oid, message.as_deref())
}

// ─── get_pending_fixups ───────────────────────────────────────────────────────

/// Returns the list of fixup! commits that have a matching base commit in history.
#[tauri::command]
pub async fn get_pending_fixups(path: String) -> Result<Vec<FixupInfo>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_fixup::list_pending_fixups(&repo)
}

// ─── autosquash_preview ───────────────────────────────────────────────────────

/// Groups fixup commits with their base commits for preview.
#[tauri::command]
pub async fn autosquash_preview(path: String) -> Result<Vec<AutosquashGroup>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let fixups = git_fixup::list_pending_fixups(&repo)?;
    Ok(git_fixup::group_into_autosquash(&fixups))
}

// ─── run_autosquash ───────────────────────────────────────────────────────────

/// Runs git rebase --autosquash to merge all pending fixup commits.
/// Uses GIT_SEQUENCE_EDITOR=true to auto-accept the rebase todo list.
#[tauri::command]
pub async fn run_autosquash(path: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let fixups = git_fixup::list_pending_fixups(&repo)?;
    if fixups.is_empty() {
        return Ok(());
    }

    // The oldest target is the base commit we want to rebase from (use its parent as base)
    let oldest_target = &fixups[fixups.len() - 1].target_oid;
    let base_ref = format!("{oldest_target}^");

    let output = app
        .shell()
        .command("git")
        .args(["-C", &path, "rebase", "-i", "--autosquash", &base_ref])
        .env("GIT_SEQUENCE_EDITOR", "true")
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}
