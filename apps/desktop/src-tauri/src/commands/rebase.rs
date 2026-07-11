use crate::error::AppError;
use crate::models::RebaseState;
use crate::services::git_rebase;
use git2::Repository;
use tauri::Emitter;

/// Progress of a running rebase, broadcast to every window so the main UI can drive its
/// launchpad-style progress strip and pick up a conflict pause without the user having to
/// notice on their own. Shared by every command that shells out to `git rebase`, interactive
/// or not (plain rebase-onto, `run_interactive_rebase`, `run_autosquash`).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RebaseProgress<'a> {
    repo_path: &'a str,
    /// `start` | `done` | `paused` | `error`
    phase: &'a str,
}

pub(crate) fn emit_progress(app: &tauri::AppHandle, repo_path: &str, phase: &str) {
    let _ = app.emit("rebase-progress", RebaseProgress { repo_path, phase });
}

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
        return err_unless_paused(&path, &output.stderr);
    }
    Ok(())
}

/// Continues a paused rebase (`git rebase --continue`). `GIT_EDITOR=true` accepts
/// whatever commit message is already staged rather than prompting. If `message` is
/// provided (the conflict panel's "amend previous commit" reword), it's written into
/// `rebase-merge/message` first — the file `git` shows in the editor for the step it's
/// about to finish — so the no-op editor picks it up instead of the step's original message.
#[tauri::command]
pub async fn continue_rebase(
    path: String,
    message: Option<String>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    if let Some(trimmed) = message.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        let message_path = repo.path().join("rebase-merge").join("message");
        if message_path.parent().map(|p| p.is_dir()).unwrap_or(false) {
            std::fs::write(&message_path, format!("{trimmed}\n"))
                .map_err(|e| AppError::Unknown(e.to_string()))?;
        }
    }

    let output = app
        .shell()
        .command("git")
        .args(["-C", &path, "rebase", "--continue"])
        .env("GIT_EDITOR", "true")
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return err_unless_paused(&path, &output.stderr);
    }
    Ok(())
}

/// Skips the commit currently being replayed (`git rebase --skip`) — used when the user
/// wants to drop this step entirely rather than resolve its conflicts.
#[tauri::command]
pub async fn skip_rebase(path: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let output = app
        .shell()
        .command("git")
        .args(["-C", &path, "rebase", "--skip"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return err_unless_paused(&path, &output.stderr);
    }
    Ok(())
}

/// `git rebase` (and `--continue`) exit non-zero when they pause for a conflict — that's
/// normal, expected behavior, not a failure. Only surface an error if the repo *isn't* left
/// paused mid-rebase (a real failure: bad ref, dirty worktree preventing the rebase, etc.).
/// Shared with `interactive_rebase.rs`, which pauses through the same states.
pub(crate) fn err_unless_paused(path: &str, stderr: &[u8]) -> Result<(), String> {
    let repo = Repository::open(path).map_err(AppError::Git)?;
    let state = git_rebase::get_rebase_state(&repo)?;
    if state.kind == "conflict" || state.kind == "edit_pause" {
        return Ok(());
    }
    Err(String::from_utf8_lossy(stderr).to_string())
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
