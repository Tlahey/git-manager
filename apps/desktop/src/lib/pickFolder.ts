import { open } from '@tauri-apps/plugin-dialog'
import { pickPath } from './pickPath'

/**
 * Opens a folder picker and resolves with the chosen path, or `null` if cancelled.
 *
 * In a real build this is the native OS dialog. WebDriver can't drive that dialog (see
 * apps/e2e/README.md's "Driving UI state without a real native dialog"), so an e2e build swaps in
 * `E2ePathPickerDialog` — a plain in-webview debug dialog a test can type a path into and click
 * through. Never rendered, and never captured in a `@doc` screenshot, in a real build.
 */
export function pickFolder(): Promise<string | null> {
  return pickPath(async () => {
    const selected = await open({ directory: true, multiple: false })
    return typeof selected === 'string' ? selected : null
  })
}
