import { unpinObject, objectsExist } from '../lib/tauri'

/**
 * Wrappers dédiés pour `stores/undoHistory.store.ts`. Séparés de `git.api.ts`
 * pour éviter un import circulaire : `git.api.ts` importe déjà
 * `useUndoHistoryStore` depuis ce store (pour `pushAction`/`clearRedo`).
 */

export async function apiUnpinObject(path: string, refName: string) {
  return unpinObject(path, refName)
}

export async function apiObjectsExist(path: string, oids: string[]) {
  return objectsExist(path, oids)
}
