//! Native window material (macOS vibrancy).
//!
//! CSS `backdrop-filter` can only sample pixels that are *inside* the webview, so
//! a translucent theme built on it blurs a copy of the app's own background — which
//! reads as a flat tint, not as glass. The real macOS material comes from an
//! `NSVisualEffectView` installed behind the webview: it samples the desktop, so
//! transparent regions of the page show the blurred wallpaper the way Finder's or
//! Mail's sidebar does.
//!
//! This is opt-in per theme rather than always-on: with vibrancy applied, any part
//! of the page that doesn't paint an opaque background becomes see-through, which
//! is wrong for every theme except the translucent ones. The frontend enables it
//! when a glass-family theme is selected and disables it otherwise.
//!
//! ## Why the material's own tint is stripped (measured, not assumed)
//!
//! AppKit's semantic materials are not "blur + a little tint": introspecting the
//! layer tree an `NSVisualEffectView` builds on macOS 26 (light appearance,
//! behind-window, active) shows every light material is a `CABackdropLayer`
//! (gaussianBlur + colorSaturate of the desktop) **covered by a near-white tint
//! layer at 0.84 alpha** plus a full-alpha darken layer — and `sidebar` and
//! `under-window` are byte-identical. At most ~16% of the blurred desktop can ever
//! come through the stock material, before the page paints a single pixel. That
//! frost is the floor no CSS alpha can go below, which is exactly why the glass
//! theme read as "a whitish wash" even with every page surface at alpha 0.
//!
//! So after applying the effect, `strip_material_tint` zeroes the opacity of the
//! tint layers (every sibling of the `CABackdropLayer`), leaving the pure Apple
//! blur+saturate. The page's own alpha (`--glass-*-alpha`, driven by the user's
//! transparency slider) then becomes the *sole* opacity dial and genuinely spans
//! clear→opaque. The strip was validated to survive window cycling and forced
//! redisplays; a delayed recheck re-applies it (and logs) in case AppKit ever
//! rebuilds the material's layers.
//!
//! Requires `macOSPrivateApi: true` in tauri.conf.json. That uses a private Apple
//! API, which bars the app from the Mac App Store — not a constraint here, since
//! git-manager ships through GitHub releases and its own updater.

use tauri::{Theme, WebviewWindow};

/// Applies (or removes) the native window material behind the webview.
///
/// `material` is the theme's requested vibrancy: `"under-window"` for the
/// whole-window backdrop material (the most pronounced, and what a translucent
/// window generally wants), `"sidebar"` for the pale material used by Finder's
/// rail, `"hud"` for the dark, heavy one.
///
/// `"none"` removes the effect and restores the webview backdrop, which is what an
/// ordinary opaque theme needs. There is deliberately no "blur off but still
/// translucent" value: the NSVisualEffectView *is* the blur, so dropping it drops the
/// glass. How see-through the window looks is tuned by the material's own tint and by
/// the page's alpha, not by removing the effect.
///
/// A no-op on non-macOS targets: the effect has no equivalent there, and an error
/// would force every caller to branch on the platform.
/// NOT `async`, and that is load-bearing: AppKit refuses to install an
/// NSVisualEffectView off the main thread, and Tauri dispatches async commands to
/// a worker. As an async fn this failed every single call with "can only be used on
/// the main thread" — invisibly, because the caller swallows the error, so the
/// window just stayed opaque and the theme looked like a badly tuned flat tint.
#[tauri::command]
pub fn set_window_vibrancy(
    window: WebviewWindow,
    material: String,
    appearance: String,
) -> Result<(), String> {
    // The semantic AppKit materials render against the window's effectiveAppearance,
    // so a light glass theme would come out dark on a Mac in dark mode (and the
    // reverse). Pinning the appearance to the theme's own polarity is what keeps the
    // material matching the tokens; "system" hands it back to the OS, which is what
    // an ordinary opaque theme wants.
    //
    // Best-effort ON PURPOSE — do not turn this into `?`. The appearance pin is a
    // refinement; the material is the feature. Propagating a failure here returns
    // before the vibrancy is ever applied, and since the caller swallows the error
    // the only symptom is the glass silently going away. That regression already
    // happened once.
    let theme = match appearance.as_str() {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    };
    if let Err(e) = window.set_theme(theme) {
        eprintln!("[vibrancy] could not pin window appearance to '{appearance}': {e}");
    }

    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{
            apply_vibrancy, clear_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
        };

        let result = match material.as_str() {
            "sidebar" | "hud" | "under-window" => {
                let effect = match material.as_str() {
                    "hud" => NSVisualEffectMaterial::HudWindow,
                    "sidebar" => NSVisualEffectMaterial::Sidebar,
                    _ => NSVisualEffectMaterial::UnderWindowBackground,
                };
                // State::Active, not the crate's FollowsWindowActiveState default:
                // an *inactive* NSVisualEffectView stops sampling what is behind the
                // window and renders a flat fill of its own base colour — which under a
                // light material is plain white. For a theme where the material IS the
                // window background, that means the whole app turns opaque the moment
                // it loses focus. Blending mode stays BehindWindow (the crate's
                // default), which is what samples the desktop rather than the page.
                // Remove the previous effect view first: apply_vibrancy always ADDS
                // one, and this command runs on every theme change, so without this
                // the content view accumulates a stack of NSVisualEffectViews.
                let _ = clear_vibrancy(&window);
                apply_vibrancy(&window, effect, Some(NSVisualEffectState::Active), None)
                    .map_err(|e| e.to_string())
                    .inspect(|_| {
                        clear_webview_backdrop(&window);
                        let muted = strip_material_tint(&window);
                        eprintln!("[vibrancy] stripped material tint ({muted} layer(s) muted)");
                        schedule_material_recheck(&window);
                    })
            }
            _ => clear_vibrancy(&window)
                .map(|_| ())
                .map_err(|e| e.to_string()),
        };

        // The caller deliberately swallows this error (the effect is decoration, and
        // absent off macOS), which otherwise makes a silent failure indistinguishable
        // from a mis-tuned theme: the window simply stays opaque and the glass reads
        // as a flat tint. Report it here so it is visible in the dev log at least.
        match &result {
            Ok(()) => eprintln!("[vibrancy] applied '{material}' (appearance '{appearance}')"),
            Err(e) => eprintln!("[vibrancy] failed to apply '{material}': {e}"),
        }
        result
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = &material;
        Ok(())
    }
}

/// Makes the webview's own backdrop transparent so the material behind it is visible.
///
/// This is the piece that actually decides whether a translucent theme renders: the
/// window can be non-opaque, the NSVisualEffectView can be correctly installed below
/// the webview, the page can be fully transparent — and the window still comes out
/// solid, because WKWebView paints `underPageBackgroundColor` *under* the page.
/// Since macOS 12 that colour is derived from the window appearance rather than from
/// the `transparent` flag, so pinning the appearance (which a polarised glass theme
/// has to do) silently repaints it: opaque white under a light appearance, near-black
/// under a dark one. It has to be reset to clear after every appearance change.
///
/// Diagnosed by reading it back at runtime — it reported `sRGB 1 1 1 1` while every
/// other layer was correctly transparent.
#[cfg(target_os = "macos")]
fn clear_webview_backdrop(window: &WebviewWindow) {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{NSColor, NSWindow};

    let Ok(ptr) = window.ns_window() else {
        eprintln!("[vibrancy] no ns_window handle; webview backdrop left as-is");
        return;
    };

    // SAFETY: `ns_window()` hands back the live NSWindow for this webview window, and
    // the command is synchronous, which is what puts us on the main thread (see the
    // note on the command). The only mutation is setting a colour property.
    unsafe {
        let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
        let Some(content) = ns_window.contentView() else {
            return;
        };
        let subviews = content.subviews();
        let clear = NSColor::clearColor();

        for i in 0..subviews.count() {
            let view = subviews.objectAtIndex(i);
            let obj: &AnyObject = &*(Retained::as_ptr(&view) as *const AnyObject);
            if !obj.class().name().contains("WebView") {
                continue;
            }
            // respondsToSelector, because underPageBackgroundColor is macOS 12+.
            let selector = objc2::sel!(setUnderPageBackgroundColor:);
            let responds: bool = objc2::msg_send![obj, respondsToSelector: selector];
            if responds {
                let _: () = objc2::msg_send![obj, setUnderPageBackgroundColor: &*clear];
            }
            let _: () = objc2::msg_send![obj, setOpaque: false];
        }
    }
}

/// The tag `window-vibrancy` gives the `NSVisualEffectView` it installs
/// (`NS_VIEW_TAG_BLUR_VIEW` in the crate), used to find it again.
#[cfg(target_os = "macos")]
const BLUR_VIEW_TAG: isize = 91376254;

/// Whether a Core Animation layer class is the material's backdrop layer — the
/// one that samples and blurs what is behind the window. Everything else in the
/// material's layer group (white tint, darken pass, wallpaper-chameleon) is
/// frost to remove. Matched by name because `CABackdropLayer` is a private
/// class: there is no public symbol to compare against.
#[cfg(target_os = "macos")]
fn is_backdrop_layer_class(class_name: &str) -> bool {
    class_name.contains("CABackdropLayer")
}

/// Zeroes the opacity of the material's tint layers, leaving only the blur.
///
/// Measured on macOS 26 (light appearance): the stock material composites a
/// 0.84-alpha near-white layer plus a full-alpha darken layer *over* its
/// `CABackdropLayer`, capping how much desktop can ever show through at ~16%
/// no matter what the page paints. Muting every sibling of the backdrop layer
/// removes that floor: the effect view becomes pure blur+saturate, and the
/// page's own alpha becomes the only opacity control — which is what lets the
/// user's transparency slider actually reach "see-through".
///
/// Returns how many layers were muted (0 when the strip is already in place),
/// so callers can log whether AppKit rebuilt the material behind our back.
#[cfg(target_os = "macos")]
fn strip_material_tint(window: &WebviewWindow) -> usize {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSWindow;

    let Ok(ptr) = window.ns_window() else {
        return 0;
    };

    // SAFETY: same contract as `clear_webview_backdrop` — live NSWindow, main
    // thread (the command is synchronous, the recheck uses run_on_main_thread).
    unsafe {
        let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
        let Some(content) = ns_window.contentView() else {
            return 0;
        };
        let Some(effect_view) = content.viewWithTag(BLUR_VIEW_TAG) else {
            return 0;
        };
        let layer: Option<Retained<AnyObject>> = objc2::msg_send_id![&*effect_view, layer];
        let Some(layer) = layer else {
            return 0;
        };
        mute_tint_siblings(&layer)
    }
}

/// Recursively finds the layer level containing the `CABackdropLayer` and sets
/// every other layer at that level to opacity 0, inside a `CATransaction` with
/// actions disabled so the change doesn't animate.
#[cfg(target_os = "macos")]
unsafe fn mute_tint_siblings(layer: &objc2::runtime::AnyObject) -> usize {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;

    let sublayers: Option<Retained<AnyObject>> = objc2::msg_send_id![layer, sublayers];
    let Some(sublayers) = sublayers else {
        return 0;
    };
    let count: usize = objc2::msg_send![&*sublayers, count];

    let mut has_backdrop = false;
    for i in 0..count {
        let sub: Retained<AnyObject> = objc2::msg_send_id![&*sublayers, objectAtIndex: i];
        if is_backdrop_layer_class(sub.class().name()) {
            has_backdrop = true;
            break;
        }
    }

    let mut muted = 0;
    if has_backdrop {
        let transaction = objc2::class!(CATransaction);
        let _: () = objc2::msg_send![transaction, begin];
        let _: () = objc2::msg_send![transaction, setDisableActions: true];
        for i in 0..count {
            let sub: Retained<AnyObject> = objc2::msg_send_id![&*sublayers, objectAtIndex: i];
            if !is_backdrop_layer_class(sub.class().name()) {
                let opacity: f32 = objc2::msg_send![&*sub, opacity];
                if opacity != 0.0 {
                    let _: () = objc2::msg_send![&*sub, setOpacity: 0.0f32];
                    muted += 1;
                }
            }
        }
        let _: () = objc2::msg_send![transaction, commit];
        return muted;
    }

    for i in 0..count {
        let sub: Retained<AnyObject> = objc2::msg_send_id![&*sublayers, objectAtIndex: i];
        muted += mute_tint_siblings(&sub);
    }
    muted
}

/// Re-checks the native glass stack shortly after it is applied, and logs it.
///
/// Two passes, for two different reasons:
///
/// - **150ms**: `NSVisualEffectView` builds its material layers lazily, on the
///   first display cycle — so the strip done synchronously inside the command
///   can find nothing to mute. The early pass catches the freshly built tint
///   before the user can register the frost.
/// - **1500ms**: two things can theoretically undo the setup later — WebKit
///   repainting `underPageBackgroundColor` (it is derived from the window
///   appearance, which this command changes), and AppKit rebuilding the
///   material's tint layers on a redisplay. Neither was observed once the strip
///   landed, but both were plausible enough to burn debugging time on — so
///   instead of trusting, this re-applies both fixes and prints what it found.
///   `re_muted=0` in the log means the strip held.
#[cfg(target_os = "macos")]
fn schedule_material_recheck(window: &WebviewWindow) {
    let win = window.clone();
    std::thread::spawn(move || {
        let mut elapsed = 0u64;
        for delay_ms in [150u64, 1350] {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            elapsed += delay_ms;
            let handle = win.clone();
            let _ = win.run_on_main_thread(move || {
                clear_webview_backdrop(&handle);
                let re_muted = strip_material_tint(&handle);
                let effect_views = count_effect_views(&handle);
                eprintln!(
                    "[vibrancy] t+{elapsed}ms recheck: effect_views={effect_views} \
                     re_muted={re_muted} (re_muted>0 means the tint appeared after the \
                     previous pass)"
                );
            });
        }
    });
}

/// How many `NSVisualEffectView`s sit in the window's content view — exactly one
/// is correct while a glass theme is active; more means applies are stacking.
#[cfg(target_os = "macos")]
fn count_effect_views(window: &WebviewWindow) -> usize {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSWindow;

    let Ok(ptr) = window.ns_window() else {
        return 0;
    };
    // SAFETY: read-only walk of the live view hierarchy on the main thread.
    unsafe {
        let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
        let Some(content) = ns_window.contentView() else {
            return 0;
        };
        let subviews = content.subviews();
        let mut count = 0;
        for i in 0..subviews.count() {
            let view = subviews.objectAtIndex(i);
            let obj: &AnyObject = &*(Retained::as_ptr(&view) as *const AnyObject);
            if obj.class().name().contains("NSVisualEffectView") {
                count += 1;
            }
        }
        count
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::is_backdrop_layer_class;

    #[test]
    fn backdrop_layer_is_recognised_and_kept() {
        assert!(is_backdrop_layer_class("CABackdropLayer"));
        // A private subclass would still contain the base name.
        assert!(is_backdrop_layer_class("CustomCABackdropLayerVariant"));
    }

    #[test]
    fn tint_layers_are_not_backdrop_layers() {
        // The measured material stack: tint, darken and chameleon layers must
        // all be muted, the backing/container layers are never at issue.
        for class in ["CALayer", "CAChameleonLayer", "NSViewBackingLayer"] {
            assert!(!is_backdrop_layer_class(class));
        }
    }
}
