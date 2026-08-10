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

use crate::error::AppError;
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
    //
    // This one is app-wide (tao implements `set_theme` as `NSApp.setAppearance:`), and the
    // frontend is built around that: `windowAppearanceForTheme` answers "system" for every theme
    // without a material precisely so the pin never outlives the glass theme that needed it. A
    // window that wants a pin *only for itself* must use `pin_window_appearance_dark` instead —
    // that distinction is what the notification flicker came down to.
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
                    .map_err(|e| String::from(crate::error::AppError::Unknown(e.to_string())))
                    .inspect(|_| {
                        clear_webview_backdrop(&window);
                        // The synchronous strip usually mutes nothing: the material's
                        // layers are built lazily on first display. The recheck below is
                        // what actually does the work, and it is the one that reports.
                        strip_material_tint(&window);
                        schedule_material_recheck(&window);
                    })
            }
            _ => clear_vibrancy(&window)
                .map(|_| ())
                .map_err(|e| String::from(crate::error::AppError::Unknown(e.to_string()))),
        };

        // The caller deliberately swallows this error (the effect is decoration, and
        // absent off macOS), which otherwise makes a silent failure indistinguishable
        // from a mis-tuned theme: the window simply stays opaque and the glass reads
        // as a flat tint. Report it here so it is visible in the dev log at least.
        // Only failures are reported. This used to log the success path too, which
        // meant several lines on every theme change — noise that buries the one case
        // worth seeing. A silent success here is the expected state.
        if let Err(e) = &result {
            eprintln!("[vibrancy] failed to apply '{material}': {e}");
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

/// Makes a window genuinely transparent — no material, no backdrop — for a window that paints
/// its own shape and wants real desktop showing through everywhere else.
///
/// `transparent: true` at creation is not enough on its own: WKWebView still paints
/// `underPageBackgroundColor` under the page, so a page with rounded corners renders as a solid
/// rectangle with the corners merely *drawn* on it (see `clear_webview_backdrop`). Clearing that
/// is normally a side effect of applying a vibrancy material, which is why the notification
/// popover used to ask for `hud` purely to get it — and inherited a frosted-glass rectangle
/// filling the margin around its card. This is the same fix without the material.
///
/// Separate from `set_window_vibrancy`'s `"none"` branch on purpose: that branch is what an
/// ordinary *opaque* theme takes on the main window, where the webview backdrop is exactly what
/// should be restored, not cleared.
///
/// NOT `async` — same main-thread requirement as the two commands around it.
#[tauri::command]
pub fn clear_window_backdrop(window: WebviewWindow) {
    // Pinned dark for the same reason `set_window_vibrancy` pins it: WebKit derives
    // `underPageBackgroundColor` from the window appearance and repaints it on every change, so
    // leaving it on "system" means a Mac in light mode repaints an opaque *white* backdrop
    // straight back over the one just cleared below.
    //
    // Deliberately NOT `window.set_theme(...)` — see `pin_window_appearance_dark`: that call is
    // app-wide on macOS, and this window is a notification that must not repaint the app it is
    // notifying about.
    #[cfg(target_os = "macos")]
    {
        pin_window_appearance_dark(&window);
        clear_webview_backdrop(&window);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
    }
}

/// Pins **one window's** appearance to dark, leaving every other window alone.
///
/// Deliberately not `WebviewWindow::set_theme`, despite its per-window receiver: on macOS tao
/// implements it as `NSApp.setAppearance:` (`platform_impl::macos::window::set_ns_theme`), which is
/// process-wide. So the notch card pinning *itself* dark repainted the main window too — WebKit
/// derives `underPageBackgroundColor` from the appearance, so an opaque light theme flashed dark
/// for as long as a notification was on screen, and `prefers-color-scheme` flipped with it, which
/// drags a `system` theme all the way to dark and leaves it there (nothing pins the appearance back
/// when the card closes). That was the "the theme flickers dark while a notification is up" bug.
///
/// `NSWindow.setAppearance:` is the per-window equivalent, and the window's views — the WKWebView
/// included, which is the whole point — inherit it. Nothing has to undo it either: the pin dies
/// with the window, where an app-wide one outlives the card that set it.
///
/// Best-effort, like every other native refinement in this file: a card that is slightly the wrong
/// shade is better than one that fails to show.
#[cfg(target_os = "macos")]
fn pin_window_appearance_dark(window: &WebviewWindow) {
    use objc2_app_kit::{
        NSAppearance, NSAppearanceCustomization, NSAppearanceNameDarkAqua, NSWindow,
    };

    let Ok(ptr) = window.ns_window() else {
        eprintln!("[transparent-window] no ns_window handle; appearance left as-is");
        return;
    };

    // SAFETY: same contract as `clear_webview_backdrop` — `ns_window()` hands back the live
    // NSWindow, and the calling command is synchronous, which is what puts us on the main thread.
    unsafe {
        let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
        let Some(dark) = NSAppearance::appearanceNamed(NSAppearanceNameDarkAqua) else {
            eprintln!(
                "[transparent-window] NSAppearanceNameDarkAqua unavailable; appearance left as-is"
            );
            return;
        };
        ns_window.setAppearance(Some(&dark));
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
///   instead of trusting, this re-applies both fixes every time. It stays silent
///   when it finds nothing wrong, and logs only the two actionable anomalies: a
///   tint that came back after the early pass, or an effect-view count other
///   than one.
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
                // Silent when healthy. The pass still *runs* every time — it re-applies
                // both fixes — it just doesn't announce that nothing was wrong. Only the
                // two anomalies are worth a line, and each is actionable:
                //   re_muted > 0 on the late pass = AppKit rebuilt the tint after the
                //     early strip, so the frost can come back and the delays need work.
                //   effect_views != 1 = applies are stacking (or the effect vanished).
                let late_tint = elapsed > 1000 && re_muted > 0;
                if late_tint || effect_views != 1 {
                    eprintln!(
                        "[vibrancy] t+{elapsed}ms recheck: effect_views={effect_views} \
                         re_muted={re_muted} (expected 1 and 0)"
                    );
                }
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

/// Raises this window's native level above the system menu bar, so its content visually renders
/// as if it originates from behind the bar — the same trick a real, shipped Tauri "notch box" app
/// (github.com/lnB51/Noci) uses: `NSWindow.Level(rawValue: 40)`, above `NSMainMenuWindowLevel`
/// (24) and `NSStatusWindowLevel` (25) but below the more exotic system levels, plus
/// `canJoinAllSpaces` so the popover isn't tied to whichever Space was active when it was created
/// — a notification arriving while the user is in a different Space (or a full-screen app) should
/// still be able to show. A cross-platform Tauri window (even with `always_on_top`) never reaches
/// this level on its own; it sits below the menu bar by default like any normal app window.
///
/// NOT `async`, for the same reason as `set_window_vibrancy`: AppKit refuses window mutations off
/// the main thread, and an async command runs on a worker — that failure is invisible to the
/// caller, so this must stay synchronous.
#[tauri::command]
pub fn raise_above_menu_bar(window: WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWindow;

        const NOTCH_WINDOW_LEVEL: isize = 40;
        // NSWindowCollectionBehavior.canJoinAllSpaces (1 << 0) | .stationary (1 << 4): visible
        // regardless of which Space is active, and not swept along by Mission Control / Spaces
        // transitions like a normal document window would be.
        const CAN_JOIN_ALL_SPACES_STATIONARY: u64 = 1 | 16;

        let Ok(ptr) = window.ns_window() else {
            eprintln!("[notification-popover] no ns_window handle; level left as-is");
            return;
        };
        // SAFETY: `ns_window()` hands back the live NSWindow for this webview window, and the
        // command is synchronous, which is what puts us on the main thread.
        unsafe {
            let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
            let _: () = objc2::msg_send![ns_window, setLevel: NOTCH_WINDOW_LEVEL];
            let _: () =
                objc2::msg_send![ns_window, setCollectionBehavior: CAN_JOIN_ALL_SPACES_STATIONARY];
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
    }
}

/// Reveals this window without ever taking focus away from whatever the user is actually doing.
///
/// A notification must never interrupt: the card slides in over the menu bar while the user keeps
/// typing in their editor, and the app stays exactly as active (or inactive) as it was. Tauri's own
/// `WebviewWindow::show()` cannot do that — on macOS it goes through tao's
/// `makeKeyAndOrderFront:`, which makes the window key and pulls the whole application forward.
/// That is right for a window the user asked for and wrong for one the app raised on its own; a
/// notch card arriving mid-keystroke used to steal the keyboard.
///
/// `orderFrontRegardless` is the AppKit call that means precisely this: order the window to the
/// front of its level *even though the application isn't active*, without making it key.
///
/// This used to add "clicking the card still activates the app the normal way, which is the one
/// moment focus should move". That was wrong, and it was the bug: a *click* — on the ✕, on the
/// Cancel button, anywhere — is not a request to leave what you were doing, and macOS activating
/// the whole application for it is exactly what users reported. See
/// [`make_window_nonactivating`], which is what stops it.
///
/// NOT `async`, for the same reason as `raise_above_menu_bar`: AppKit window mutations must happen
/// on the main thread, and Tauri runs async commands on a worker where the call would silently do
/// nothing.
#[tauri::command]
pub fn show_without_activating(window: WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWindow;

        let Ok(ptr) = window.ns_window() else {
            // Deliberately no `window.show()` fallback. It used to be one, on the reasoning that a
            // card that appears rudely beats one that never appears — and that trade is wrong.
            // `show()` is `makeKeyAndOrderFront:`, which pulls the whole application forward and
            // takes the keyboard out of whatever the user is actually typing in. A card is a
            // courtesy; one that costs the user their keystrokes costs more than it is worth. So
            // the failure mode is silence (and this line in the log), not an interruption.
            eprintln!("[notification-popover] no ns_window handle; card not shown");
            return;
        };
        // SAFETY: `ns_window()` hands back the live NSWindow for this webview window, and the
        // command is synchronous, which is what puts us on the main thread.
        unsafe {
            let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
            let _: () = objc2::msg_send![ns_window, orderFrontRegardless];
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Windows and Linux have no equivalent one-liner here, but nor do they have the macOS
        // behaviour this exists to avoid: the window was created with `focus: false`, and showing
        // it does not activate the application.
        let _ = window.show();
    }
}

/// `NSWindowStyleMaskNonactivatingPanel` — the one style bit that stops a click on a window from
/// activating the application that owns it. AppKit asserts unless the receiver really is an
/// `NSPanel`, which is the entire reason [`make_window_nonactivating`] swaps the window's class
/// before setting it.
#[cfg(target_os = "macos")]
const NONACTIVATING_PANEL_MASK: usize = 1 << 7;

/// The runtime `NSPanel` subclass the notch window is re-classed into.
#[cfg(target_os = "macos")]
const NOTCH_PANEL_CLASS: &str = "GitManagerNotchPanel";

/// The runtime subclass of wry's own webview class that accepts the first click.
///
/// The name deliberately still contains `WebView`: [`clear_webview_backdrop`] and
/// [`count_effect_views`] find the webview by matching its class name, and a subclass named
/// anything else would make the notch window's backdrop silently stop being cleared.
#[cfg(target_os = "macos")]
const FIRST_MOUSE_WEBVIEW_CLASS: &str = "GitManagerFirstMouseWebView";

/// A registered Objective-C class, held in a `static`.
///
/// A class object is immortal and immutable once registered, and the runtime is what serialises
/// registration — but objc2 does not mark `&AnyClass` `Send`/`Sync`, so it needs saying. Same
/// wrapper tao uses for its own window class, for the same reason.
#[cfg(target_os = "macos")]
struct StaticClass(&'static objc2::runtime::AnyClass);
#[cfg(target_os = "macos")]
unsafe impl Send for StaticClass {}
#[cfg(target_os = "macos")]
unsafe impl Sync for StaticClass {}

/// `canBecomeKeyWindow` / `canBecomeMainWindow`, reading the same `focusable` ivar tao's own window
/// class does — see [`notch_panel_class`] for why this has to be re-implemented rather than
/// inherited.
#[cfg(target_os = "macos")]
extern "C" fn is_focusable(
    this: &objc2::runtime::AnyObject,
    _: objc2::runtime::Sel,
) -> objc2::runtime::Bool {
    // SAFETY: only ever installed on `NOTCH_PANEL_CLASS`, which declares this ivar itself.
    #[allow(deprecated)]
    unsafe {
        *this.get_ivar::<objc2::runtime::Bool>("focusable")
    }
}

/// `acceptsFirstMouse:` — yes, always. See [`make_window_nonactivating`].
#[cfg(target_os = "macos")]
extern "C" fn accepts_first_mouse(
    _this: &objc2::runtime::AnyObject,
    _: objc2::runtime::Sel,
    _event: *mut objc2::runtime::AnyObject,
) -> objc2::runtime::Bool {
    objc2::runtime::Bool::YES
}

/// The `NSPanel` subclass the notch window becomes, registered once.
///
/// It re-declares the `focusable` ivar and the two `canBecome…Window` overrides that tao's own
/// `TaoWindow` class provides, because re-classing the window away from `TaoWindow` takes both with
/// it — and `WebviewWindow::set_focusable` (which the notch calls per card) writes that ivar *by
/// name*, so a class without it would not merely change behaviour, it would panic the process.
#[cfg(target_os = "macos")]
fn notch_panel_class() -> Option<&'static objc2::runtime::AnyClass> {
    use objc2::runtime::{AnyClass, Bool, ClassBuilder};
    use objc2::sel;
    use std::sync::OnceLock;

    static CLASS: OnceLock<Option<StaticClass>> = OnceLock::new();
    CLASS
        .get_or_init(|| {
            if let Some(existing) = AnyClass::get(NOTCH_PANEL_CLASS) {
                return Some(StaticClass(existing));
            }
            let superclass = AnyClass::get("NSPanel")?;
            let mut builder = ClassBuilder::new(NOTCH_PANEL_CLASS, superclass)?;
            builder.add_ivar::<Bool>("focusable");
            // SAFETY: both selectors are declared by NSWindow with exactly this signature
            // (`BOOL (id, SEL)`), which is what objc2 verifies these implementations against.
            unsafe {
                builder.add_method(
                    sel!(canBecomeKeyWindow),
                    is_focusable as extern "C" fn(_, _) -> _,
                );
                builder.add_method(
                    sel!(canBecomeMainWindow),
                    is_focusable as extern "C" fn(_, _) -> _,
                );
            }
            Some(StaticClass(builder.register()))
        })
        .as_ref()
        .map(|held| held.0)
}

/// The subclass of wry's webview class that accepts the first click, registered once.
///
/// Subclassing the *live* class rather than a named one, and adding no ivars, is what makes the
/// re-class below trivially safe: the subclass has exactly the instance size of the object already
/// allocated.
#[cfg(target_os = "macos")]
fn first_mouse_webview_class(
    superclass: &'static objc2::runtime::AnyClass,
) -> Option<&'static objc2::runtime::AnyClass> {
    use objc2::runtime::{AnyClass, ClassBuilder};
    use objc2::sel;
    use std::sync::OnceLock;

    static CLASS: OnceLock<Option<StaticClass>> = OnceLock::new();
    CLASS
        .get_or_init(|| {
            if let Some(existing) = AnyClass::get(FIRST_MOUSE_WEBVIEW_CLASS) {
                return Some(StaticClass(existing));
            }
            let mut builder = ClassBuilder::new(FIRST_MOUSE_WEBVIEW_CLASS, superclass)?;
            // SAFETY: `acceptsFirstMouse:` is declared by NSView as `BOOL (id, SEL, NSEvent *)`,
            // which is the signature this implementation has.
            unsafe {
                builder.add_method(
                    sel!(acceptsFirstMouse:),
                    accepts_first_mouse as extern "C" fn(_, _, _) -> _,
                );
            }
            Some(StaticClass(builder.register()))
        })
        .as_ref()
        .map(|held| held.0)
}

/// Re-classes an Objective-C instance, refusing whenever the new class is larger than the one the
/// object was allocated for.
///
/// That guard is the whole safety argument. `object_setClass` does not reallocate, so a class whose
/// instances are bigger would put its own ivars past the end of the allocation — and, because the
/// runtime lays a subclass's ivars out at its superclass's instance size, equal sizes are also
/// exactly the condition under which an inherited ivar (`focusable`) keeps its offset and therefore
/// its value.
///
/// Returns whether the swap happened; `false` is always safe to ignore — the window merely keeps
/// the behaviour it had.
#[cfg(target_os = "macos")]
fn reclass(object: &objc2::runtime::AnyObject, class: &'static objc2::runtime::AnyClass) -> bool {
    let current = object.class();
    if current.name() == class.name() {
        return true;
    }
    if class.instance_size() > current.instance_size() {
        eprintln!(
            "[notch] not re-classing {} into {}: {} bytes against {} — see `reclass`",
            current.name(),
            class.name(),
            class.instance_size(),
            current.instance_size()
        );
        return false;
    }
    // SAFETY: the size guard above is the precondition; both pointers are live for the call.
    unsafe {
        objc2::ffi::object_setClass(
            (object as *const objc2::runtime::AnyObject as *mut objc2::runtime::AnyObject).cast(),
            (class as *const objc2::runtime::AnyClass).cast(),
        );
    }
    true
}

/// Makes the notch window one the user can click without losing what they were doing.
///
/// ## The bug this exists for
///
/// A card is by definition raised while the user is in another application, and **clicking any
/// window of a background application activates that application** — before the click reaches
/// anything inside it. So pressing the card's ✕ pulled the whole app in front of whatever the user
/// was in, at the exact moment they said they were done with it; and pressing its *Cancel* button
/// did nothing at all, because the click that activates an app is not delivered to the view under
/// it (AppKit's "first mouse" rule) unless that view opts in. One click, two symptoms, one cause.
///
/// ## Two things that were tried first, and why neither could work
///
/// - **`focus: false` at creation.** That governs whether the window is made key when it is shown,
///   which is a different question from whether a click activates the application.
/// - **`focusable: false` / `setFocusable(false)`**, on the reasoning that a window which cannot
///   become key cannot hand key status to the main window when it is ordered out. tao really does
///   map that option onto `canBecomeKeyWindow` and `canBecomeMainWindow` (its `focusable` ivar), and
///   the notch window really cannot become key — and the bug survived it in the real app. That is
///   the measurement that rules the key-window path out entirely: the activation is the
///   *application's*, not the window's, and no window-level flag addresses it.
///
/// ## What actually addresses it
///
/// `NSWindowStyleMaskNonactivatingPanel` is the documented "clicking this does not activate the
/// owning app" bit, and only an `NSPanel` may carry it — hence the class swap, which is the same
/// technique the `tauri-nspanel` crate is built on. Paired with `acceptsFirstMouse:` returning
/// `YES` on the webview, so the click that no longer activates anything is delivered to the button
/// the user aimed at. **Both halves are required**: the panel alone would leave a card whose
/// buttons never respond (nothing activates, so every click stays a first-mouse click), and the
/// first-mouse acceptance alone would leave a card that works but still yanks the app forward.
///
/// ## Why it is re-asserted per card rather than set at creation
///
/// The notch keeps **one** window for the life of the app (see `lib/notifications/notchWindow.ts`),
/// so a creation-time option only ever describes the window a particular launch happened to build —
/// a frontend reload leaves the previous one standing, which is precisely how the first attempt at
/// this fix reached nobody. Saying it again on every card is what makes it true of the window that
/// is actually on screen. Both halves are idempotent.
///
/// ## What the class swap costs, and why it is affordable here
///
/// Re-classing away from tao's `TaoWindow` drops its three overrides. Two —
/// `canBecomeKeyWindow`/`canBecomeMainWindow` and the `focusable` ivar behind them — are
/// re-declared by [`notch_panel_class`], so `setFocusable` goes on working exactly as it did. The
/// third is `sendEvent:`, whose only content is dragging a window by its background
/// (`performWindowDragWithEvent:` when `isMovableByWindowBackground`): **the notch card has no drag
/// region and must never grow one**, because this is where that would stop working. Everything else
/// tao and Tauri do to this window — `orderOut:`, `orderFrontRegardless`, `setFrame:`, `setLevel:`,
/// `close`, its delegate — is `NSWindow` API an `NSPanel` inherits untouched.
///
/// Reports whether the window is now in that state, for the caller's log; every failure leaves the
/// window exactly as it was, which is a card that is rude rather than no card at all.
///
/// NOT `async`, for the same reason as every other command in this file: AppKit window mutations
/// must happen on the main thread, and Tauri runs async commands on a worker where they would
/// silently do nothing.
#[tauri::command]
pub fn make_window_nonactivating(window: WebviewWindow) -> bool {
    #[cfg(target_os = "macos")]
    {
        use objc2::runtime::AnyObject;
        use objc2_app_kit::NSWindow;

        let Ok(ptr) = window.ns_window() else {
            eprintln!(
                "[notch] no ns_window handle; clicking the card will go on activating the app"
            );
            return false;
        };
        // SAFETY: `ns_window()` hands back the live NSWindow for this webview window, and the
        // command is synchronous, which is what puts us on the main thread.
        unsafe {
            let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
            let object: &AnyObject = &*(ns_window as *const NSWindow as *const AnyObject);

            let panelled = match notch_panel_class() {
                Some(class) if reclass(object, class) => {
                    let mask: usize = objc2::msg_send![object, styleMask];
                    let _: () =
                        objc2::msg_send![object, setStyleMask: mask | NONACTIVATING_PANEL_MASK];
                    // A panel's own default is to disappear whenever its application is
                    // deactivated, which for a card raised *because* the user is elsewhere would
                    // mean never being seen at all. The flag lives on the instance and so did not
                    // change under the class swap — this states it rather than relying on that.
                    let _: () = objc2::msg_send![object, setHidesOnDeactivate: false];
                    true
                }
                _ => {
                    eprintln!("[notch] could not turn the card into a nonactivating panel");
                    false
                }
            };

            let clickable = accept_first_mouse_in_webviews(ns_window);
            panelled && clickable
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Nothing to do, and nothing wrong: no other platform activates a whole application
        // because one of its windows was clicked.
        let _ = window;
        true
    }
}

/// Makes every webview in this window accept the click that would otherwise only activate the app.
///
/// wry's webview class implements `acceptsFirstMouse:` by reading an ivar it sets at creation from
/// Tauri's `acceptFirstMouse` option — which is therefore unreachable afterwards. Re-classing the
/// live view into a subclass that answers `YES` outright is what makes it assertable per card
/// instead, on a window that outlives every card it shows.
#[cfg(target_os = "macos")]
unsafe fn accept_first_mouse_in_webviews(window: &objc2_app_kit::NSWindow) -> bool {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;

    let Some(content) = window.contentView() else {
        return false;
    };
    let subviews = content.subviews();
    let mut found = false;
    for i in 0..subviews.count() {
        let view = subviews.objectAtIndex(i);
        let object: &AnyObject = &*(Retained::as_ptr(&view) as *const AnyObject);
        let class = object.class();
        if !class.name().contains("WebView") {
            continue;
        }
        found = true;
        if class.name() == FIRST_MOUSE_WEBVIEW_CLASS {
            continue;
        }
        match first_mouse_webview_class(class) {
            Some(subclass) => {
                if !reclass(object, subclass) {
                    return false;
                }
            }
            None => return false,
        }
    }
    found
}

/// Whether this application is the active (frontmost) one right now.
///
/// Exists for exactly one caller: the notch window's opener, which refuses to *create* a window
/// while the app is in the background — because creating one activates the whole application, and
/// nothing can reliably undo that (handing the activation back afterwards was tried, shipped, and
/// reported from the real app as still visibly stealing the window). See `notchWindow.ts`.
///
/// Deliberately not read as `document.hasFocus()` in the frontend. That answers "does *this
/// webview* have focus", which is false whenever another window of this same app is key — the
/// merge editor, the fixup window, the action journal. Deactivating the application on the
/// strength of that would throw the user out of a window they were working in. `NSApplication`'s
/// own flag is about the *application*, which is the thing being activated and so the thing worth
/// asking about.
///
/// `true` when there is nothing to ask (off macOS, or off the main thread) — the answer that keeps
/// a platform with no such problem, and a call that could not be made, from silencing every card.
///
/// NOT `async`, for the same reason as `raise_above_menu_bar`: `NSApplication` is main-thread-only
/// in AppKit's own terms, and Tauri runs async commands on a worker.
#[tauri::command]
pub fn is_app_active() -> bool {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSApplication;
        use objc2_foundation::MainThreadMarker;

        let Some(mtm) = MainThreadMarker::new() else {
            return true;
        };
        // SAFETY: a read-only property, on the main thread the marker proves this call is on.
        unsafe { NSApplication::sharedApplication(mtm).isActive() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Points an existing window at a new URL, instead of closing it and opening another.
///
/// The notch's reason for existing: creating a webview activates the whole application (see
/// [`is_app_active`]), and a card is by definition raised while the user is somewhere else. One window, created once while the app is legitimately frontmost and then *navigated*
/// per card, is the only shape that never pays that price — a navigation touches no
/// `NSApplication` at all.
///
/// It also keeps what made the per-card window worth having: the card's content still travels in
/// the URL, so the page still mounts with everything it needs and there is still no race between a
/// window appearing and its content arriving.
///
/// NOT `async`: `navigate` posts a message to the event loop, and `send_user_message` runs it
/// inline when it is already on the main thread — which a synchronous command is. From a worker it
/// would take the long way round for no reason.
#[tauri::command]
pub fn navigate_window(app: tauri::AppHandle, label: String, url: String) -> Result<(), String> {
    use tauri::Manager;

    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| AppError::InvalidInput(format!("no window labelled {label}")))?;
    let parsed: tauri::Url = url
        .parse()
        .map_err(|e| AppError::InvalidInput(format!("unusable window URL {url}: {e}")))?;
    window
        .navigate(parsed)
        .map_err(|e| AppError::Unknown(e.to_string()))?;
    Ok(())
}

/// The real per-machine notch/camera-housing geometry, read from AppKit instead of guessed at.
///
/// The notch card's layout (`packages/notch`) used to carry these as hard-coded constants —
/// `NOTCH_BAND_HEIGHT = 32`, `NOTCH_HOUSING_HALF_WIDTH = 100` — which are the values every
/// currently-shipping notched Mac happens to report, not a fact about any particular one. This is
/// what lets the card ask the actual machine instead, and still fall back to those same defaults
/// (kept in the frontend) wherever this returns `None`.
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotchMetrics {
    /// `NSScreen.safeAreaInsets.top`, in points. `0` on a display with no camera housing.
    pub safe_area_top: f64,
    /// Half the width of the reserved area the housing occupies — the card is centred on the
    /// housing, so this is as much of it as either side has to clear. `0` when there is no
    /// housing at all.
    pub housing_half_width: f64,
}

/// Reads [`NotchMetrics`] off the primary display: the one carrying the menu bar (and the tray
/// icon the notch window is anchored to), which is index 0 of `NSScreen.screens()` — deliberately
/// not `NSScreen.mainScreen()`, which follows whichever window currently has keyboard focus and
/// is answering a different question.
///
/// `Ok(None)` rather than an error, off macOS or if AppKit unexpectedly reports no screens at all
/// (headless CI, a display waking up) — the frontend already has its own defaults for exactly
/// this "nothing to go on" case, and every caller of a Tauri command has to handle a rejection
/// specially, while `None` is just its ordinary fallback path.
///
/// NOT `async`, for the same reason as `raise_above_menu_bar`: `NSScreen` is main-thread-only in
/// AppKit's own terms, and an async command runs on a worker, where every call here would panic.
#[tauri::command]
pub fn get_notch_metrics() -> Result<Option<NotchMetrics>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(notch_metrics_macos())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(None)
    }
}

/// Reads the geometry off `NSScreen.screens()[0]` — the primary display (menu bar, tray icon),
/// not `NSScreen.mainScreen()`, which follows whichever window has keyboard focus and is a
/// different question that only coincides with it while the app itself is focused.
///
/// Reached through `screens()` + `firstObject` rather than the typed `NSScreen::screens(mtm)`
/// binding indexed with `.get(0)` — **measured, not assumed**: on this SDK, `NSScreen.screens`
/// comes back backed by a Swift `ContiguousArrayStorage`, whose `count` reports a different type
/// encoding than objc2's generated binding expects (`'q'` vs the `'Q'` it verifies against),
/// which panics the whole process the moment anything asks the array its length — including
/// `objc2`'s own typed `.get()`, which reads `count` first to bounds-check the index. `firstObject`
/// never calls `count` at all, so it never hits it.
///
/// ## Why the read is wrapped in `catch_unwind`
///
/// That panic was only ever *measured* on one machine, on a very recent macOS. Nobody knows
/// whether the encoding it trips over is that build's or everyone's, and the app should not find
/// out by disappearing on a user's desk: the card losing its exact alignment is a cosmetic
/// problem, while the process going down over the geometry of a notification is not.
///
/// Not a thread, which would be the usual way to contain this: `NSScreen` is main-thread-only in
/// AppKit's own terms, and every call below would panic on a worker. On the main thread,
/// `catch_unwind` gives the same containment.
///
/// It matters in **debug builds specifically**, which is exactly where the panic lives:
/// `objc2`'s encoding verification is `#[cfg(debug_assertions)]`, so a release build never runs
/// the check that fired — and could not be caught here anyway, since the release profile is
/// `panic = "abort"`. So this protects `pnpm dev` on an unfamiliar machine, which is the only
/// place the failure has ever been seen.
#[cfg(target_os = "macos")]
fn notch_metrics_macos() -> Option<NotchMetrics> {
    use objc2_foundation::MainThreadMarker;

    MainThreadMarker::new()?;

    // `AssertUnwindSafe` because the closure borrows nothing that could be left half-updated by a
    // panic — it reads four numbers out of AppKit and touches no state of ours.
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(read_notch_metrics)) {
        Ok(metrics) => metrics,
        Err(_) => {
            eprintln!(
                "[notch] reading the screen's notch geometry panicked; falling back to the \
                 frontend's default measurements"
            );
            None
        }
    }
}

/// The AppKit read itself, split out so the recovery above has something to wrap.
#[cfg(target_os = "macos")]
fn read_notch_metrics() -> Option<NotchMetrics> {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSEdgeInsets, NSRect};

    // SAFETY: every send below is read-only, and confined to the main thread the caller's
    // `MainThreadMarker` proves this call is on. AppKit is already linked into this binary by the
    // rest of this file's typed `objc2_app_kit` usage, so resolving `NSScreen` by name (rather
    // than importing the crate's own binding, which is exactly what this exists to avoid indexing
    // into) is safe.
    unsafe {
        let screens: Retained<AnyObject> = objc2::msg_send_id![objc2::class!(NSScreen), screens];
        let screen: Option<Retained<AnyObject>> = objc2::msg_send_id![&*screens, firstObject];
        let screen = screen?;

        let insets: NSEdgeInsets = objc2::msg_send![&*screen, safeAreaInsets];
        let left: NSRect = objc2::msg_send![&*screen, auxiliaryTopLeftArea];
        let right: NSRect = objc2::msg_send![&*screen, auxiliaryTopRightArea];

        Some(NotchMetrics {
            safe_area_top: insets.top,
            housing_half_width: housing_half_width(
                left.origin.x,
                left.size.width,
                right.origin.x,
                right.size.width,
            ),
        })
    }
}

/// Half the gap between the two safe-area rects flanking the housing.
///
/// Takes plain coordinates rather than `NSRect` (both auxiliary areas' `origin.x`/`size.width`) so
/// the arithmetic is testable on every platform, not only where AppKit exists — the same reason
/// `git_hooks::resolve_hooks_path` is kept separate from the `Repository` it is usually read from.
///
/// `0` when either rect has no width, which is what a display with no camera housing at all
/// reports for both (`NSZeroRect`) — the one case a caller must not read as "there is a gap of
/// zero", but as "there is no housing to make room for".
fn housing_half_width(left_x: f64, left_width: f64, right_x: f64, right_width: f64) -> f64 {
    if left_width <= 0.0 || right_width <= 0.0 {
        return 0.0;
    }
    ((right_x - (left_x + left_width)) / 2.0).max(0.0)
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::{housing_half_width, is_backdrop_layer_class};

    #[test]
    fn housing_half_width_is_the_gap_between_the_two_safe_areas() {
        // A screen 1512pt wide, the left safe area from 0 to 656, the right from 856 to 1512 —
        // a 200pt housing centred on the screen, so 100pt either side of its midpoint.
        assert_eq!(housing_half_width(0.0, 656.0, 856.0, 656.0), 100.0);
    }

    #[test]
    fn no_housing_reports_a_zero_half_width() {
        // NSZeroRect on both sides is what a display with no camera housing reports.
        assert_eq!(housing_half_width(0.0, 0.0, 0.0, 0.0), 0.0);
    }

    #[test]
    fn a_zero_width_area_on_either_side_alone_reports_zero() {
        // Half a housing measurement is not a measurement; treat it the same as none at all.
        assert_eq!(housing_half_width(0.0, 656.0, 856.0, 0.0), 0.0);
        assert_eq!(housing_half_width(0.0, 0.0, 856.0, 656.0), 0.0);
    }

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
