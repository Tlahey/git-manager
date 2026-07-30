use crate::services;
use crate::services::activity_log::LogKind;

/// Appends a batch of frontend activity-log entries to the rotating on-disk log (one JSONL file per
/// day under `~/.git-manager/activity-logs/`, pruned after a week). Entries are opaque JSON here —
/// the frontend owns their shape and has already redacted/truncated them. Async so the file IO runs
/// off the main thread; failures map through `AppError` like every other command.
#[tauri::command]
pub async fn append_activity_log(entries: Vec<serde_json::Value>) -> Result<(), String> {
    services::activity_log::append(LogKind::Activity, &entries)?;
    Ok(())
}

/// Appends one AI call's full transcript — both prompts and the model's answer — to its own rotating
/// log under `~/.git-manager/ai-logs/`.
///
/// Separate from the activity log on purpose. That one records IPC arguments truncated to 200
/// characters and never sees a return value, so it can say an AI call happened and how long it took
/// but not what was asked or answered — which is exactly what an AI bug needs. Keeping the full text
/// out of it also keeps the log the user exports for ordinary debugging free of their source code.
#[tauri::command]
pub async fn append_ai_log(entries: Vec<serde_json::Value>) -> Result<(), String> {
    services::activity_log::append(LogKind::AiTranscript, &entries)?;
    Ok(())
}

/// Reads the most recent activity-log entries back off disk, newest first.
///
/// Exists for the "Behind the scenes" window, which is its own `WebviewWindow` and therefore its own
/// JS context: the in-memory buffer the main window captures is unreachable from there, so the
/// rotating log is the shared surface. Entries come back as the opaque JSON they were written as —
/// the frontend owns their shape, and validating it here would be a second definition of it.
///
/// `max_entries` is a cap on entries read, not on actions shown: the caller filters the stream down
/// to the operations that changed something, so it asks for far more lines than it will display.
#[tauri::command]
pub async fn read_activity_log(max_entries: usize) -> Result<Vec<serde_json::Value>, String> {
    Ok(services::activity_log::read_recent(
        LogKind::Activity,
        max_entries,
    )?)
}

/// Reveals the on-disk activity-logs directory in the Finder (creating it first if needed).
#[tauri::command]
pub async fn open_activity_logs_dir() -> Result<(), String> {
    services::activity_log::open_dir(LogKind::Activity)?;
    Ok(())
}

/// Reveals the on-disk AI transcript directory in the Finder.
#[tauri::command]
pub async fn open_ai_logs_dir() -> Result<(), String> {
    services::activity_log::open_dir(LogKind::AiTranscript)?;
    Ok(())
}
