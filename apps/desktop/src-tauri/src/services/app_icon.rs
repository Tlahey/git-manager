//! The application icon, in its two halves — the running app's, and the bundle's.
//!
//! **A runtime swap can never be early enough.** `NSApplication::setApplicationIconImage` only
//! ever *replaces* an icon macOS has already drawn: LaunchServices resolves the bundle's `.icns`
//! and the Dock paints the launch tile before `main()` runs. So every runtime apply — however
//! early it is scheduled, and whether the chosen id reaches it from `settings.json` read in
//! `setup` or from a cache the frontend reads first — is visible as a flicker. Moving that read
//! earlier is not a fix, because the read was never what was late.
//!
//! Hence the second half: [`persist_bundle_icon`] gives the *bundle on disk* the chosen icon
//! through the Finder's custom-icon mechanism (`NSWorkspace::setIcon:forFile:options:`), which
//! LaunchServices honours when it builds the launch tile. The next start then shows the right
//! icon with nothing left to replace.
//!
//! That custom icon lives in an `Icon\r` file at the bundle *root* — beside `Contents/`, not
//! inside it — plus a Finder flag. Neither is covered by the code signature, which seals
//! `Contents/`. Do **not** "simplify" this into overwriting `Contents/Resources/icon.icns`:
//! that breaks the signature and Gatekeeper refuses the app.
//!
//! Both halves are needed, and neither is redundant with the other:
//! - the runtime one makes a change visible in the session that made it, and is the only one
//!   that does anything under `pnpm dev` (an unbundled binary has no `.app` to carry an icon);
//! - the persisted one is what makes the *next* launch flicker-free. It is re-checked on every
//!   startup because the updater installs a fresh bundle, dropping the `Icon\r` file with it.

use tauri::AppHandle;

/// Resolves an icon identifier to the PNG compiled into the binary.
///
/// Supported identifiers:
/// - "default": Standard default icon
/// - "neon": Cyber neon cyan outline on dark glass
/// - "3d": Tactile glossy 3D clay & glass
/// - "light": Minimalist line-art outline on light gradient
/// - "duotone": Modern duotone cyan & navy silhouette
/// - "line": Clean white line-art contour on matte dark background
/// - "flat": Modern 2D flat vector design in cyan & turquoise
/// - "minimal-light": Clean charcoal line-art contour on light slate background
pub fn icon_bytes(icon_name: &str) -> Result<&'static [u8], String> {
    match icon_name {
        "default" => Ok(include_bytes!("../../icons/icon.png")),
        "neon" => Ok(include_bytes!("../../icons/icon_neon.png")),
        "3d" => Ok(include_bytes!("../../icons/icon_3d.png")),
        "light" => Ok(include_bytes!("../../icons/icon_light.png")),
        "duotone" => Ok(include_bytes!("../../icons/icon_duotone.png")),
        "line" => Ok(include_bytes!("../../icons/icon_line.png")),
        "flat" => Ok(include_bytes!("../../icons/icon_flat.png")),
        "minimal-light" => Ok(include_bytes!("../../icons/icon_minimal_light.png")),
        unknown => Err(format!("Unknown icon identifier: {unknown}")),
    }
}

/// The icon id persisted in `~/.git-manager/settings.json`, or `"default"` when the file is
/// absent, unreadable, or holds nothing at `settings.appearance.appIcon`.
///
/// Read in Rust rather than received from the frontend because this runs during `setup`, long
/// before the webview exists.
pub fn persisted_icon_name() -> String {
    let Ok(Some(contents)) = crate::services::app_config::read() else {
        return "default".to_string();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return "default".to_string();
    };
    json.get("settings")
        .and_then(|s| s.get("appearance"))
        .and_then(|a| a.get("appIcon"))
        .and_then(|i| i.as_str())
        .filter(|name| icon_bytes(name).is_ok())
        .unwrap_or("default")
        .to_string()
}

/// Swaps the icon of the *running* application — the Dock tile on macOS, the window icon
/// elsewhere. Takes effect at once and lasts only as long as the process; see the module comment
/// for why this cannot be the whole answer.
pub fn apply_runtime_icon(app_handle: &AppHandle, icon_name: &str) -> Result<(), String> {
    let icon_bytes = icon_bytes(icon_name)?;

    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        let image = tauri::image::Image::from_bytes(icon_bytes)
            .map_err(|e| format!("Failed to parse icon image: {e}"))?;

        if let Some(window) = app_handle.get_webview_window("main") {
            window
                .set_icon(image)
                .map_err(|e| format!("Failed to set window icon: {e}"))?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        let apply_dock_icon = move || {
            use objc2::ClassType;
            use objc2_app_kit::{NSApplication, NSImage};
            use objc2_foundation::NSData;

            if let Some(mtm) = objc2_foundation::MainThreadMarker::new() {
                let ns_data = NSData::with_bytes(icon_bytes);
                if let Some(ns_image) = NSImage::initWithData(NSImage::alloc(), &ns_data) {
                    let app = NSApplication::sharedApplication(mtm);
                    unsafe {
                        app.setApplicationIconImage(Some(&ns_image));
                    }
                }
            }
        };

        if objc2_foundation::MainThreadMarker::new().is_some() {
            apply_dock_icon();
        } else {
            app_handle
                .run_on_main_thread(apply_dock_icon)
                .map_err(|e| format!("Failed to schedule Dock icon update on main thread: {e}"))?;
        }
    }

    Ok(())
}

/// The `.app` this binary is running from, or `None` when it isn't running from one — which is
/// every `pnpm dev` run, since `tauri dev` launches the bare executable.
#[cfg(target_os = "macos")]
fn app_bundle_path() -> Option<std::path::PathBuf> {
    // <name>.app/Contents/MacOS/<binary>
    let exe = std::env::current_exe().ok()?;
    let bundle = exe.parent()?.parent()?.parent()?;
    if bundle.extension().is_some_and(|ext| ext == "app") {
        Some(bundle.to_path_buf())
    } else {
        None
    }
}

/// The Finder's custom-icon file, at the bundle root. Its name really is `Icon` followed by a
/// carriage return.
#[cfg(target_os = "macos")]
const CUSTOM_ICON_FILE: &str = "Icon\r";

/// Gives the installed `.app` the chosen icon, so the *next* launch draws it from the start.
///
/// `"default"` removes the custom icon, letting the bundle's own `.icns` show through again.
/// Fails when the bundle isn't writable (an app installed by another user) or when running
/// unbundled; callers treat that as non-fatal — the runtime swap still applies, at the cost of
/// the flicker this exists to remove.
#[cfg(target_os = "macos")]
pub fn persist_bundle_icon(icon_name: &str) -> Result<(), String> {
    use objc2::ClassType;
    use objc2_app_kit::{NSImage, NSWorkspace};
    use objc2_foundation::{NSData, NSString};

    let bundle = app_bundle_path().ok_or_else(|| "Not running from an .app bundle".to_string())?;
    let bundle_path = NSString::from_str(&bundle.to_string_lossy());

    let image = if icon_name == "default" {
        // A nil image clears the custom icon rather than setting one.
        None
    } else {
        let bytes = icon_bytes(icon_name)?;
        let ns_data = NSData::with_bytes(bytes);
        Some(
            NSImage::initWithData(NSImage::alloc(), &ns_data)
                .ok_or_else(|| "Failed to decode icon image".to_string())?,
        )
    };

    let applied = unsafe {
        NSWorkspace::sharedWorkspace().setIcon_forFile_options(
            image.as_deref(),
            &bundle_path,
            objc2_app_kit::NSWorkspaceIconCreationOptions::empty(),
        )
    };

    if applied {
        Ok(())
    } else {
        Err(format!(
            "macOS refused to set the bundle icon on {}",
            bundle.display()
        ))
    }
}

#[cfg(not(target_os = "macos"))]
pub fn persist_bundle_icon(_icon_name: &str) -> Result<(), String> {
    Ok(())
}

/// Writes the bundle icon only when the bundle doesn't already carry one that matches the
/// setting, which is what makes this cheap enough to run on every startup.
///
/// The check is the presence of the `Icon\r` file, not its contents: an `.icns` resource can't
/// be compared against our PNG, and the only state the presence check can't tell apart — a
/// bundle carrying variant A while the setting says B — is already corrected by
/// [`persist_bundle_icon`] on the change itself. What this call is really for is the launch
/// after an update, where the updater installed a fresh bundle and the file is simply gone.
#[cfg(target_os = "macos")]
pub fn sync_bundle_icon(icon_name: &str) -> Result<(), String> {
    let bundle = app_bundle_path().ok_or_else(|| "Not running from an .app bundle".to_string())?;
    let has_custom_icon = bundle.join(CUSTOM_ICON_FILE).exists();

    if has_custom_icon == (icon_name != "default") {
        return Ok(());
    }
    persist_bundle_icon(icon_name)
}

#[cfg(not(target_os = "macos"))]
pub fn sync_bundle_icon(_icon_name: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_every_shipped_icon_id() {
        for id in [
            "default",
            "neon",
            "3d",
            "light",
            "duotone",
            "line",
            "flat",
            "minimal-light",
        ] {
            assert!(icon_bytes(id).is_ok(), "{id} should resolve to bytes");
        }
    }

    #[test]
    fn rejects_an_unknown_icon_id() {
        assert!(icon_bytes("../../etc/passwd").is_err());
        assert!(icon_bytes("").is_err());
    }
}
