// Kept out of `AiProviderForm.tsx` so that file exports components only — a module mixing a
// component with a plain helper loses Vite's Fast Refresh (`react/only-export-components`).

/**
 * Reads the extra-request-fields box: the object to persist, or the reason it cannot be.
 *
 * Empty means "nothing extra", which is a valid state and clears the setting rather than an error.
 * Anything else must parse to a JSON **object** — an array or a bare string would be spliced into a
 * request body where it means nothing, and the failure would surface as an HTTP 400 on every AI
 * call rather than here, next to the box that caused it.
 */
export function parseExtraBody(text: string): {
  value?: Record<string, unknown>
  error: boolean
} {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { value: {}, error: false }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { error: true }
    }
    return { value: parsed as Record<string, unknown>, error: false }
  } catch {
    return { error: true }
  }
}
