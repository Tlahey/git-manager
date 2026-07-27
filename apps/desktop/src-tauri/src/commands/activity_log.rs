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
