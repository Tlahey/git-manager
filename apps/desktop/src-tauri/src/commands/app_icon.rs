use tauri::AppHandle;

use crate::services::app_icon;

/// Applies the chosen icon twice over: to the running app, so the change is visible now, and to
/// the installed bundle, so the next launch draws it without a flicker. See
/// [`crate::services::app_icon`] for why one without the other is not enough.
///
/// The bundle half is best-effort: an app the current user can't write to (installed by someone
/// else) still gets the runtime swap rather than an error the user can do nothing about.
#[tauri::command]
pub async fn set_app_icon(app_handle: AppHandle, icon_name: String) -> Result<(), String> {
    app_icon::apply_runtime_icon(&app_handle, &icon_name)?;

    if let Err(err) = app_icon::persist_bundle_icon(&icon_name) {
        eprintln!("[app-icon] could not persist the icon onto the app bundle: {err}");
    }

    Ok(())
}
