import { open } from '@tauri-apps/plugin-dialog'
import { pickPath } from './pickPath'

export interface PickFileOptions {
  /** e.g. `[{ name: 'Patch', extensions: ['patch', 'diff'] }]` */
  filters?: { name: string; extensions: string[] }[]
}

/**
 * Opens a single-file picker and resolves with the chosen path, or `null` if cancelled. See
 * `pickFolder.ts` for why an e2e build swaps in a debug dialog instead of the native one.
 */
export function pickFile(options: PickFileOptions = {}): Promise<string | null> {
  return pickPath(async () => {
    const selected = await open({ multiple: false, filters: options.filters })
    return typeof selected === 'string' ? selected : null
  })
}
