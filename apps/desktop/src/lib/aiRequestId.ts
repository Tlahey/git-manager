/** Monotonic part of the id, so two generations started in the same millisecond still differ. */
let sequence = 0

/**
 * Mints the id that tags one AI generation's `ai:*` events.
 *
 * Uniqueness has to hold across *windows*, not just within one: the `ai:*` events are emitted by a
 * single Rust backend shared by every window the app has open, so a counter alone would collide the
 * moment a second window started a generation at the same tick. `randomUUID` covers that; the
 * counter and timestamp are the fallback for environments that do not expose it (jsdom under Vitest
 * being the one that matters here), where a collision would need two windows in the same
 * millisecond on the same random draw.
 */
export function newAiRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `ai-${uuid}`
  return `ai-${Date.now().toString(36)}-${(sequence++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
