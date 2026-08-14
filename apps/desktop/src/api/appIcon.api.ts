import type { AppIconId } from '@git-manager/git-types'
import { setAppIcon } from '../lib/tauri'

/**
 * Applies the chosen icon to the running app *and* to the installed `.app` bundle, so the change
 * shows now and the next launch needs no swap at all. The bundle half is best-effort in Rust —
 * see `services/app_icon.rs` — so this resolving says nothing about whether it succeeded.
 *
 * @param iconName Identifier of the icon: 'neon' | '3d' | 'light' | 'duotone' | 'default' | ...
 */
export async function apiSetAppIcon(iconName: AppIconId): Promise<void> {
  return setAppIcon(iconName)
}
