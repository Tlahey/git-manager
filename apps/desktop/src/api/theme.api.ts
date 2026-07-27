import { getUserThemes, setWindowVibrancy } from '../lib/tauri'

export async function apiGetUserThemes() {
  return getUserThemes()
}

/**
 * Applies the native window material (macOS vibrancy) behind the webview, or
 * clears it with `'none'`. Failures are swallowed: the effect is decoration, and
 * it is unavailable off macOS and in browser dev mode, where the caller has
 * nothing useful to do about it.
 */
export async function apiSetWindowVibrancy(material: string, appearance: string) {
  try {
    await setWindowVibrancy(material, appearance)
  } catch {
    // No Tauri host, or the platform has no equivalent effect — ignore.
  }
}
