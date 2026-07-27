use crate::services;
use crate::services::daily_summary_archive::StoredSummaryFile;

/// Writes one morning's briefing to the markdown archive under
/// `~/.git-manager/summaries/<repo-slug>/YYYY-MM-DD.md`, pruning anything past the retention window.
///
/// The markdown is built frontend-side (it is the feature's own serialization, not git data) and
/// `date` comes from the frontend's local clock, exactly like the summary window itself. Returns the
/// path written, so the UI can offer "open in editor" without listing the archive again.
#[tauri::command]
pub async fn save_daily_summary(
    repo_path: String,
    date: String,
    markdown: String,
    also_in_repo: bool,
) -> Result<String, String> {
    services::daily_summary_archive::write_summary(&repo_path, &date, &markdown, also_in_repo)
        .map_err(Into::into)
}

/// Reads the whole archive — every repository, every retained day — newest first.
#[tauri::command]
pub async fn list_daily_summaries() -> Result<Vec<StoredSummaryFile>, String> {
    services::daily_summary_archive::list_summaries().map_err(Into::into)
}

/// Deletes one archived briefing. Paths outside the archive are rejected by the service.
#[tauri::command]
pub async fn delete_daily_summary(file_path: String) -> Result<(), String> {
    services::daily_summary_archive::delete_summary(&file_path)?;
    Ok(())
}

/// Reveals the archive directory in the Finder (creating it first if needed).
#[tauri::command]
pub async fn open_daily_summaries_dir() -> Result<(), String> {
    services::daily_summary_archive::open_dir()?;
    Ok(())
}
