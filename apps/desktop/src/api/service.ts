import { appEventBus, type AppEvent } from '../lib/appEventBus'

/**
 * Runs a Tauri-backed operation and notifies `appEventBus` once it succeeds. This is the one
 * place where "call the backend, then tell the rest of the app about it" is wired — new
 * cross-cutting concerns (analytics, a future audit log, etc.) hook into `appEventBus` instead
 * of being added at every call site in `api/*.api.ts`.
 *
 * Only wraps calls that actually need to notify something; a plain pass-through API function
 * with no event to raise should just call `lib/tauri.ts` directly rather than going through this
 * with a fake/unused event.
 */
export async function callCommand<T>(
  event: AppEvent,
  fn: () => Promise<T>,
  payload?: any
): Promise<T> {
  const result = await fn()
  appEventBus.notify(event, payload)
  return result
}
