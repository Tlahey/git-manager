//! Delivery of a *clickable* native OS notification.
//!
//! `tauri-plugin-notification` cannot do this on desktop. Its JS `onAction()` subscribes to the
//! plugin event `actionPerformed`, which only the plugin's **mobile** implementation ever emits:
//! on desktop `sendNotification` goes through `notify_rust`, is spawned fire-and-forget, and the
//! plugin registers no listener command at all (verified against tauri-plugin-notification 2.3.3 —
//! `desktop.rs` + `lib.rs`'s `invoke_handler`). So `onAction` silently rejects and a click on a
//! macOS banner did nothing at all.
//!
//! `notify_rust` reaches macOS notifications through `mac-notification-sys`, which *does* expose
//! the interaction: `Notification::wait_for_click(true)` makes `send()` block until the banner is
//! clicked, actioned or dismissed, and reports which. This module goes straight to that crate (it
//! is already in the dependency tree via the plugin, so it costs no extra compilation) and exposes
//! the one thing the plugin is missing: "show this, and tell me whether the user clicked it".
//!
//! Blocking is the whole point of the API, so [`show_awaiting_click`] must be called on a thread
//! the caller is willing to park — see `commands/notification.rs`, which owns that thread.

use crate::error::AppError;

/// A notification to show, in the terms the OS needs. Deliberately not the frontend's payload:
/// the routing information a click carries is the caller's business, and this layer never sees it.
pub struct NativeNotificationSpec {
    pub title: String,
    pub body: String,
    /// macOS system sound name (`"Ping"`, `"Blow"`, …). `None` delivers the notification silently.
    pub sound: Option<String>,
}

/// Registers the bundle identifier notifications are attributed to. Idempotent, and only the
/// first call in the process wins (`mac-notification-sys` guards it with a `Once`).
///
/// In development the binary runs straight out of `target/debug` with no surrounding `.app`, so
/// its own identifier is unknown to the notification centre and delivery fails outright. The
/// plugin has the same problem and solves it the same way: attribute dev notifications to the
/// terminal that launched the app.
#[cfg(target_os = "macos")]
pub fn register_application(bundle_identifier: &str) {
    let identifier = if tauri::is_dev() {
        "com.apple.Terminal"
    } else {
        bundle_identifier
    };
    // Best-effort: `AlreadySet` is the expected outcome from the second call onwards (and from
    // any notification the Tauri plugin itself may have sent first), not a failure.
    let _ = mac_notification_sys::set_application(identifier);
}

#[cfg(not(target_os = "macos"))]
pub fn register_application(_bundle_identifier: &str) {}

/// Shows `spec` and blocks until the user interacts with it or the system dismisses it.
///
/// Returns `true` only when the user actually clicked the notification (or one of its action
/// buttons) — a banner that timed out, was swiped away or hit the close button returns `false`,
/// so the caller never navigates behind the user's back.
#[cfg(target_os = "macos")]
pub fn show_awaiting_click(spec: &NativeNotificationSpec) -> Result<bool, AppError> {
    use mac_notification_sys::{Notification, NotificationResponse};

    let mut notification = Notification::new();
    notification
        .title(&spec.title)
        .message(&spec.body)
        .wait_for_click(true);
    if let Some(sound) = &spec.sound {
        notification.sound(sound.as_str());
    }

    match notification
        .send()
        .map_err(|e| AppError::NotificationFailed(e.to_string()))?
    {
        NotificationResponse::Click | NotificationResponse::ActionButton(_) => Ok(true),
        // `None` is the auto-dismiss (the banner faded on its own), `CloseButton`/`Reply` are
        // deliberate non-open interactions. None of them is a request to navigate.
        _ => Ok(false),
    }
}

/// Whether this platform can report a click back. Only macOS can today, so the command falls back
/// to the plugin's fire-and-forget delivery elsewhere rather than showing nothing at all.
pub const fn supports_click() -> bool {
    cfg!(target_os = "macos")
}

/// Never reached: the command checks [`supports_click`] first. Present so the module compiles for
/// a non-macOS target, and returning `false` (rather than pretending) keeps a mistaken caller from
/// navigating on its own.
#[cfg(not(target_os = "macos"))]
pub fn show_awaiting_click(_spec: &NativeNotificationSpec) -> Result<bool, AppError> {
    Ok(false)
}
