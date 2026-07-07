use crate::commands::rebase::err_unless_paused;
use crate::error::AppError;
use crate::models::GitCommit;
use crate::services::git_interactive_rebase;
use git2::{Oid, Repository};
use tauri::Emitter;

pub use crate::services::git_interactive_rebase::RebaseTodoStep;

/// Progress of a running interactive rebase, broadcast to every window so the
/// main UI can drive its launchpad-style progress strip.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RebaseProgress<'a> {
    repo_path: &'a str,
    /// `start` | `done` | `paused` | `error`
    phase: &'a str,
}

fn emit_progress(app: &tauri::AppHandle, repo_path: &str, phase: &str) {
    let _ = app.emit("rebase-progress", RebaseProgress { repo_path, phase });
}

// ─── list_rebase_commits ──────────────────────────────────────────────────────

/// Commits from `base_oid` (inclusive) up to HEAD, oldest first — the rows of
/// the "Rebasing Commit" editor.
#[tauri::command]
pub async fn list_rebase_commits(path: String, base_oid: String) -> Result<Vec<GitCommit>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_interactive_rebase::list_rebase_commits(&repo, &base_oid).map_err(Into::into)
}

// ─── run_interactive_rebase ───────────────────────────────────────────────────

/// Runs `git rebase -i` from `base_oid`'s parent with the UI-built `steps` as
/// todo list (injected via `GIT_SEQUENCE_EDITOR`, like `run_autosquash`).
/// Stays a thin command because it needs `tauri::AppHandle` to shell out; the
/// todo rendering lives in `services/git_interactive_rebase.rs`.
/// A conflict pause is not an error — the existing rebase-state UI takes over.
#[tauri::command]
pub async fn run_interactive_rebase(
    path: String,
    base_oid: String,
    steps: Vec<RebaseTodoStep>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    // Upstream argument: the parent of the oldest commit, or --root for a root commit.
    let upstream_arg = {
        let repo = Repository::open(&path).map_err(AppError::Git)?;
        let oid = Oid::from_str(&base_oid).map_err(|_| format!("Invalid OID: {base_oid}"))?;
        let commit = repo.find_commit(oid).map_err(AppError::Git)?;
        if commit.parent_count() == 0 {
            "--root".to_string()
        } else {
            format!("{base_oid}^")
        }
    };

    // The todo (and message sidecar files) must outlive this call: if the rebase
    // pauses on a conflict, later `exec git commit --amend -F <file>` steps still
    // read them on `git rebase --continue`. Left for the OS to clean up.
    let tmp_dir = std::env::temp_dir().join(format!(
        "git-manager-rebase-{}-{}",
        std::process::id(),
        chrono_free_timestamp()
    ));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let todo_path = git_interactive_rebase::write_todo(&steps, &tmp_dir)?;

    let sequence_editor = format!("cp \"{}\"", todo_path.display());

    emit_progress(&app, &path, "start");

    let output = app
        .shell()
        .command("git")
        .args(["-C", &path, "rebase", "-i", &upstream_arg])
        .env("GIT_SEQUENCE_EDITOR", sequence_editor)
        .env("GIT_EDITOR", "true")
        .output()
        .await
        .map_err(|e| {
            emit_progress(&app, &path, "error");
            e.to_string()
        })?;

    if !output.status.success() {
        // A pause (conflict/edit) is expected; anything else is a real failure.
        let result = err_unless_paused(&path, &output.stderr);
        emit_progress(&app, &path, if result.is_ok() { "paused" } else { "error" });
        return result;
    }

    emit_progress(&app, &path, "done");
    Ok(())
}

/// Millisecond timestamp without pulling in a clock crate — uniquifies temp dirs.
fn chrono_free_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
