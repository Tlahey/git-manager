import { open } from '@tauri-apps/plugin-dialog'
import { useE2eFolderPickerStore } from '../stores/e2eFolderPicker.store'

/**
 * Opens a folder picker and resolves with the chosen path, or `null` if cancelled.
 *
 * In a real build this is the native OS dialog. WebDriver can't drive that dialog (see
 * apps/e2e/README.md's "Driving UI state without a real native dialog"), so an e2e build swaps in
 * `E2eFolderPickerDialog` — a plain in-webview debug dialog a test can type a path into and click
 * through. `import.meta.env.VITE_E2E` is the same build-time constant `main.tsx` already gates its
 * test-only hooks on; never rendered, and never captured in a `@doc` screenshot, in a real build.
 */
export async function pickFolder(): Promise<string | null> {
  if (import.meta.env.VITE_E2E === 'true') {
    return useE2eFolderPickerStore.getState().request()
  }
  const selected = await open({ directory: true, multiple: false })
  return typeof selected === 'string' ? selected : null
}
