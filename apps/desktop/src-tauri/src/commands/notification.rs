//! Native OS notifications the user can click to be taken somewhere in the app.
//!
//! The frontend hands over a display payload plus an opaque `route` value. Nothing here reads
//! that value — it is echoed back verbatim on the [`NOTIFICATION_ACTIVATED_EVENT`] event when the
//! banner is clicked, and `lib/notifications/notificationRouting.ts` decides what it means. Keeping
//! the routing vocabulary entirely on the frontend is what lets a new notification kind ship
//! without a Rust change (same rule as the AI features).
//!
//! See `services/native_notification.rs` for why this exists at all rather than using
//! `tauri-plugin-notification`'s own click support.

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppError;
use crate::services::native_notification::{self, NativeNotificationSpec};

/// Event carrying the clicked notification's `route` back to the frontend.
pub const NOTIFICATION_ACTIVATED_EVENT: &str = "notification://activated";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeNotificationRequest {
    pub title: String,
    pub body: String,
    /// macOS system sound name; omitted for a silent notification.
    pub sound: Option<String>,
    /// Opaque routing payload, echoed back on click. Never interpreted here.
    pub route: serde_json::Value,
}

/// Shows a notification and, if the user clicks it, raises the app window and emits
/// [`NOTIFICATION_ACTIVATED_EVENT`] with the request's `route`.
///
/// Returns as soon as the notification is handed to the OS: the wait for the click happens on a
/// detached thread, because the underlying macOS API only reports an interaction by blocking until
/// one happens (or until the banner auto-dismisses, which is what bounds the thread's lifetime).
#[tauri::command]
pub fn send_native_notification(
    app: AppHandle,
    request: NativeNotificationRequest,
) -> Result<(), String> {
    if !native_notification::supports_click() {
        // No click reporting on this platform — still deliver the notification through the plugin
        // so a non-macOS build notifies as it always did, just without the deep link.
        return show_without_click(&app, &request).map_err(String::from);
    }

    native_notification::register_application(&app.config().identifier);

    let spec = NativeNotificationSpec {
        title: request.title,
        body: request.body,
        sound: request.sound,
    };
    let route = request.route;

    std::thread::spawn(
        move || match native_notification::show_awaiting_click(&spec) {
            Ok(true) => {
                focus_main_window(&app);
                let _ = app.emit(NOTIFICATION_ACTIVATED_EVENT, route);
            }
            Ok(false) => {}
            Err(e) => eprintln!("[notification] delivery failed: {e}"),
        },
    );

    Ok(())
}

/// Brings the app back to the front so the page the click routes to is actually visible. The
/// window may well be hidden rather than merely unfocused — closing it hides it behind the tray
/// icon (see `setup_tray` in `lib.rs`), which is exactly the state a background notification is
/// most likely to arrive in.
fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(not(target_os = "macos"))]
fn show_without_click(
    app: &AppHandle,
    request: &NativeNotificationRequest,
) -> Result<(), AppError> {
    use tauri_plugin_notification::NotificationExt;

    let mut builder = app
        .notification()
        .builder()
        .title(&request.title)
        .body(&request.body);
    if let Some(sound) = &request.sound {
        builder = builder.sound(sound);
    }
    builder
        .show()
        .map_err(|e| AppError::NotificationFailed(e.to_string()))
}

#[cfg(target_os = "macos")]
fn show_without_click(
    _app: &AppHandle,
    _request: &NativeNotificationRequest,
) -> Result<(), AppError> {
    // Unreachable on macOS (`supports_click()` is true there); kept so the caller has one shape.
    Ok(())
}
