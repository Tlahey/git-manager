import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { HOOK_PROGRESS_EVENT, type HookProgressEvent } from '../lib/tauri'

export type { HookProgressEvent } from '../lib/tauri'

/**
 * Subscribes to repository hooks starting and finishing.
 *
 * Broadcast for every repository at once — a commit in one tab and a push in another can have
 * hooks in flight together — so the handler keys on `repoPath` rather than assuming one stream.
 */
export async function apiOnHookProgress(
  handler: (event: HookProgressEvent) => void
): Promise<UnlistenFn> {
  return listen<HookProgressEvent>(HOOK_PROGRESS_EVENT, (event) => handler(event.payload))
}
