use crate::services::app_config;
use serde::Serialize;
use serde_json::Value;

/// What the frontend needs to know about the configuration in one round trip: whether the file is
/// switched off at all (`GIT_MANAGER_NO_CONFIG`, see `services/app_config.rs`), and its contents if
/// not. The two travel together because the answer to the first decides *where* the frontend
/// persists — a second command would mean a second await before the first render.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigLoad {
    /// `true` when the app must not touch the file at all, in either direction.
    pub disabled: bool,
    /// The file verbatim, or `None` on a fresh install (and always when `disabled`).
    pub contents: Option<String>,
}

#[tauri::command]
pub async fn read_app_config() -> Result<AppConfigLoad, String> {
    if app_config::is_disabled() {
        return Ok(AppConfigLoad {
            disabled: true,
            contents: None,
        });
    }
    Ok(AppConfigLoad {
        disabled: false,
        contents: app_config::read().map_err(String::from)?,
    })
}

/// Replaces one section of the configuration; a `null` value removes it. Writing per section rather
/// than per file is what keeps a stale second window from rolling back another window's changes —
/// see the module doc of `services/app_config.rs`.
#[tauri::command]
pub async fn write_app_config_section(
    section: String,
    version: u32,
    value: Value,
) -> Result<(), String> {
    app_config::write_section(&section, version, value).map_err(Into::into)
}
