import { unpinObject, objectsExist } from '../lib/tauri'

/**
 * Wrappers dedicated to `stores/undoHistory.store.ts`. Kept out of `git.api.ts` to avoid a
 * circular import: `git.api.ts` already imports `useUndoHistoryStore` from that store (for
 * `pushAction`/`clearRedo`).
 */

export async function apiUnpinObject(path: string, refName: string) {
  return unpinObject(path, refName)
}

export async function apiObjectsExist(path: string, oids: string[]) {
  return objectsExist(path, oids)
}
