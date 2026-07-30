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

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppError;
use crate::services::native_notification::{self, NativeNotificationSpec};

/// Event carrying the clicked notification's `route` back to the frontend.
pub const NOTIFICATION_ACTIVATED_EVENT: &str = "notification://activated";

/// Id given to the app's single tray icon in `setup_tray` (`lib.rs`), so it can be looked back up
/// here rather than only reachable from inside its own click handler.
const TRAY_ICON_ID: &str = "main-tray";

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

/// The tray icon's on-screen rect, already converted to logical pixels — what the frontend needs
/// to position a popover window under it (physical pixels would misplace it on a Retina display).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayIconRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Reads the tray icon's current rect so a popover can be anchored under it.
///
/// Returns `Ok(None)` — not an error — when the tray or its rect isn't available (Linux always
/// reports this; see `TrayIcon::rect()`'s platform note). That is the frontend's cue to fall back
/// to a native banner instead of failing the notification outright.
#[tauri::command]
pub fn get_tray_icon_rect(app: AppHandle) -> Result<Option<TrayIconRect>, String> {
    let Some(tray) = app.tray_by_id(TRAY_ICON_ID) else {
        return Ok(None);
    };
    let Some(rect) = tray
        .rect()
        .map_err(|e| AppError::NotificationFailed(e.to_string()))?
    else {
        return Ok(None);
    };

    // The rect comes back in physical pixels; the main window's own scale factor is the
    // pragmatic stand-in for "the display the menu bar lives on" (multi-monitor setups with a
    // different scale factor on the tray's actual display are a known, accepted POC limitation).
    let scale_factor = app
        .get_webview_window("main")
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0);

    let position = rect.position.to_logical::<f64>(scale_factor);
    let size = rect.size.to_logical::<f64>(scale_factor);

    Ok(Some(TrayIconRect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    }))
}

/// Plays a named macOS system sound (e.g. `"Pop"`) standalone, with no notification banner
/// attached to it — `mac-notification-sys`'s sound support is tied to showing a banner, which is
/// exactly what the custom popover replaces, so this shells out to `afplay` instead.
///
/// Fire-and-forget: the child is not awaited, and a spawn failure (missing `afplay`, unknown
/// sound name) is swallowed — sound here is decoration, not worth failing the caller for.
#[tauri::command]
pub fn play_system_sound(name: String) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("afplay")
            .arg(format!("/System/Library/Sounds/{name}.aiff"))
            .spawn();
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = name;
    }
}
