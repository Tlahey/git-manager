import { save } from '@tauri-apps/plugin-dialog'
import { pickPath } from './pickPath'

/**
 * Opens a save-as dialog and resolves with the chosen destination path, or `null` if cancelled.
 * See `pickFolder.ts` for why an e2e build swaps in a debug dialog instead of the native one.
 */
export function pickSaveDestination(defaultPath: string): Promise<string | null> {
  return pickPath(async () => {
    const selected = await save({ defaultPath })
    return selected ?? null
  })
}
