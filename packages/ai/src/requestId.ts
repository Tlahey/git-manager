/** Monotonic part of the id, so two calls started in the same millisecond still differ. */
let sequence = 0

/**
 * Mints the id that names one AI call to the backend — a streaming generation or a completion.
 *
 * Uniqueness has to hold across *windows*, not just within one: both kinds of call are registered in
 * a single Rust-side registry shared by every window the app has open, so a counter alone would
 * collide the moment a second window started a call at the same tick. A collision there is not
 * cosmetic — the registry keys its cancel flags by this id, replacing an entry on re-registration
 * and dropping it on completion, so two calls sharing an id means one of them cannot be cancelled
 * and the other's finish unregisters both.
 *
 * `randomUUID` covers that; the counter and timestamp are the fallback for environments that do not
 * expose it (jsdom under Vitest being the one that matters here), where a collision would need two
 * windows in the same millisecond on the same random draw.
 *
 * It lives in this package rather than in the app because `createCompletionService` and
 * {@link AiCallTracker} both mint ids, and neither may reach into the host.
 */
export function newAiRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `ai-${uuid}`
  return `ai-${Date.now().toString(36)}-${(sequence++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
