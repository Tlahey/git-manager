use crate::services;

/// Appends a batch of frontend activity-log entries to the rotating on-disk log (one JSONL file per
/// day under `~/.git-manager/activity-logs/`, pruned after a week). Entries are opaque JSON here —
/// the frontend owns their shape and has already redacted/truncated them. Async so the file IO runs
/// off the main thread; failures map through `AppError` like every other command.
#[tauri::command]
pub async fn append_activity_log(entries: Vec<serde_json::Value>) -> Result<(), String> {
    services::activity_log::append(&entries)?;
    Ok(())
}

/// Reveals the on-disk activity-logs directory in the Finder (creating it first if needed).
#[tauri::command]
pub async fn open_activity_logs_dir() -> Result<(), String> {
    services::activity_log::open_dir()?;
    Ok(())
}
