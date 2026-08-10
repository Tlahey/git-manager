import { invoke } from './invoke'
import type { UserTheme } from '@git-manager/git-types'

// ─── Configuration file (~/.git-manager/settings.json) ────────────────────────

/** Mirrors the Rust `AppConfigLoad`. `disabled` is `GIT_MANAGER_NO_CONFIG` — the app must then not
 * touch the file in either direction (the e2e suite runs this way). */
export interface AppConfigLoad {
  disabled: boolean
  /** The file verbatim, or `null` on a fresh install (and always when `disabled`). */
  contents: string | null
}

export const readAppConfig = () => invoke<AppConfigLoad>('read_app_config')

/** Replaces one section; a `null` value removes it. Per section rather than per file so a stale
 * second window can't roll back what another window changed — see `services/app_config.rs`. */
export const writeAppConfigSection = (section: string, version: number, value: unknown) =>
  invoke<void>('write_app_config_section', { section, version, value })

/** Absolute path of the configuration file, for Settings to show and reveal. `null` when there is
 * none to point at — the configuration is switched off, or the home directory is unresolvable. */
export const getAppConfigPath = () => invoke<string | null>('get_app_config_path')

// ─── Themes ───────────────────────────────────────────────────────────────────

export const getUserThemes = () => invoke<UserTheme[]>('get_user_themes')

/** Native window material behind the webview (macOS); `'none'` clears it. */
export const setWindowVibrancy = (material: string, appearance: string) =>
  invoke<void>('set_window_vibrancy', { material, appearance })

/** Raises this window's native level above the macOS menu bar (notification popover, macOS only). */
export const raiseAboveMenuBar = () => invoke<void>('raise_above_menu_bar')

/** Clears the WKWebView's opaque backdrop so a `transparent` window really is (macOS only). */
export const clearWindowBackdrop = () => invoke<void>('clear_window_backdrop')

/**
 * Reveals this window without activating the app or taking the keyboard — what a notification must
 * use instead of `WebviewWindow.show()`, which on macOS makes the window key and pulls the whole
 * application forward.
 */
export const showWithoutActivating = () => invoke<void>('show_without_activating')

/**
 * Whether the *application* is frontmost — not whether this webview has focus, which is a different
 * question whenever a second window of ours is key. `true` off macOS.
 */
export const isAppActive = () => invoke<boolean>('is_app_active')

/**
 * Points an existing window at a new URL. The notch reuses one window this way rather than opening
 * a fresh one per card, because *creating* a webview is what activates the app — see
 * `navigate_window` in `commands/window.rs`.
 */
/**
 * Turns the notch window into a nonactivating `NSPanel`, so clicking its card does not drag the app
 * in front of the user. Answers whether it is one now — `false` off macOS, or when
 * `GIT_MANAGER_NOTCH_PANEL=0` switches it off. See `make_notch_window_nonactivating`.
 */
export const makeNotchWindowNonactivating = (label: string) =>
  invoke<boolean>('make_notch_window_nonactivating', { label })

export const navigateWindow = (label: string, url: string) =>
  invoke<void>('navigate_window', { label, url })

/**
 * The real per-machine notch/camera-housing geometry, read from `NSScreen` — `null` off macOS, or
 * if AppKit unexpectedly reports no screens at all. Mirrors the Rust `NotchMetrics`.
 */
export interface NotchMetrics {
  /** `NSScreen.safeAreaInsets.top`, in points. `0` on a display with no camera housing. */
  safeAreaTop: number
  /** Half the width of the reserved area the housing occupies. `0` when there is no housing. */
  housingHalfWidth: number
}

export const getNotchMetrics = () => invoke<NotchMetrics | null>('get_notch_metrics')

// ─── Native notifications ─────────────────────────────────────────────────────

/**
 * One OS notification. `route` is opaque to Rust: it is handed back verbatim on the
 * `notification://activated` event when the user clicks the banner (see
 * `commands/notification.rs` and `api/notification.api.ts`).
 */
export interface NativeNotificationRequest {
  title: string
  body: string
  /** macOS system sound name; omit for a silent notification. */
  sound?: string
  route: unknown
}

export const sendNativeNotification = (request: NativeNotificationRequest) =>
  invoke<void>('send_native_notification', { request })

/** The tray icon's on-screen rect, in logical pixels — used to anchor the notification popover. */
export interface TrayIconRect {
  x: number
  y: number
  width: number
  height: number
}

/** `null` when the tray icon's rect isn't available (e.g. Linux) — callers fall back to native. */
export const getTrayIconRect = () => invoke<TrayIconRect | null>('get_tray_icon_rect')

/** Plays a named macOS system sound (e.g. `'Pop'`) standalone, with no notification banner. */
export const playSystemSound = (name: string) => invoke<void>('play_system_sound', { name })
