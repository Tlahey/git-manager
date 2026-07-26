/**
 * Turns the raw string a rejected Tauri AI command carries into something a user can act on.
 *
 * Rust serializes `AppError` to a JSON payload (`{ code, message, detail }`, see
 * `src-tauri/src/error.rs`), which arrives here as the rejection's message — i.e. as a JSON blob,
 * not prose. Providers add a second layer: `services/ai_openai_compatible.rs` maps its two
 * actionable transport failures onto the stable sentinels below, which the `errors` i18n namespace
 * already carries translations for.
 *
 * Anything unrecognized falls through to the payload's own `message`, and ultimately to the raw
 * string — never to a generic "an error occurred", which would throw away the only clue there is.
 */

/** Sentinels the AI layer emits — the first two from the Rust providers, the last from the model
 * probe in `@git-manager/ai`. Each has a matching `errors.<CODE>` i18n key. */
const KNOWN_AI_CODES = [
  'AI_PROVIDER_NOT_RUNNING',
  'AI_MODEL_NOT_FOUND',
  'AI_EMPTY_RESPONSE',
] as const

interface ErrorPayload {
  code?: string
  message?: string
  detail?: string | null
}

function parsePayload(raw: string): ErrorPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as ErrorPayload) : null
  } catch {
    // Not every rejection is an AppError — a JS-side throw arrives as plain text.
    return null
  }
}

/**
 * Resolves a raw AI command error into a display string.
 *
 * `translate` is the caller's `t` bound to the `errors` namespace (this module stays framework-free
 * so it can be unit-tested without an i18n provider). It is only consulted for a recognized
 * sentinel; otherwise the provider's own message is more informative than any generic copy.
 */
export function aiErrorMessage(raw: string, translate: (key: string) => string): string {
  const sentinel = KNOWN_AI_CODES.find((code) => raw.includes(code))
  if (sentinel) return translate(`errors.${sentinel}`)

  const payload = parsePayload(raw)
  const message = payload?.message?.trim()
  if (message) {
    return payload?.detail ? `${message} — ${payload.detail}` : message
  }
  return raw.trim()
}
