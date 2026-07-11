use crate::commands::rebase::{emit_progress, err_unless_paused};
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
/// Uses GIT_SEQUENCE_EDITOR=true to auto-accept the rebase todo list, and
/// --autostash because `create_fixup_commit` only commits staged changes —
/// any leftover unstaged/untracked changes would otherwise make git refuse
/// to start the rebase at all.
/// Like `run_interactive_rebase`, a conflict pause is not an error — it's reported via
/// `err_unless_paused` and the `rebase-progress` event so the existing rebase-state UI
/// (conflict banner / resolution panel) picks it up instead of leaving the repo mid-rebase
/// with no indication in the app that anything is waiting on the user.
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

    emit_progress(&app, &path, "start");

    let output = app
        .shell()
        .command("git")
        .args([
            "-C",
            &path,
            "rebase",
            "-i",
            "--autosquash",
            "--autostash",
            &base_ref,
        ])
        .env("GIT_SEQUENCE_EDITOR", "true")
        .output()
        .await
        .map_err(|e| {
            emit_progress(&app, &path, "error");
            e.to_string()
        })?;

    if !output.status.success() {
        let result = err_unless_paused(&path, &output.stderr);
        emit_progress(&app, &path, if result.is_ok() { "paused" } else { "error" });
        return result;
    }

    emit_progress(&app, &path, "done");
    Ok(())
}
