import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { REMOTE_PROGRESS_EVENT, type RemoteProgressEvent } from '../lib/tauri'

export type { RemoteOperation, RemoteProgressEvent, RemoteProgressPhase } from '../lib/tauri'

/**
 * Subscribes to fetch/pull/push transfer progress.
 *
 * The events are broadcast for every repository at once — several transfers can be in flight —
 * so the handler is expected to key on `repoPath` and `operation` rather than assume a single
 * stream.
 */
export async function apiOnRemoteProgress(
  handler: (event: RemoteProgressEvent) => void
): Promise<UnlistenFn> {
  return listen<RemoteProgressEvent>(REMOTE_PROGRESS_EVENT, (event) => handler(event.payload))
}
