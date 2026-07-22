/**
 * Pretty-prints an activity entry's `args` payload for the detail panel. The capture layer
 * (`debugLogRedact.ts`) stringifies nested objects and can hand us either a plain object or a JSON
 * string, so this: parses a JSON-looking string back into a value, expands nested JSON-looking
 * strings one level deep, and indents the result. Anything that isn't JSON (a truncated payload, a
 * `[redacted]` marker, a plain string) is returned unchanged.
 */

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

/** Expands a nested string that is itself JSON into its parsed value; leaves everything else as is. */
function expand(value: unknown): unknown {
  if (typeof value === 'string' && looksLikeJson(value)) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

export function formatActivityData(args: unknown): string {
  if (args === undefined || args === null) return ''

  let root: unknown = args
  if (typeof args === 'string') {
    if (!looksLikeJson(args)) return args
    try {
      root = JSON.parse(args)
    } catch {
      return args
    }
  }

  try {
    return JSON.stringify(root, (_key, value) => expand(value), 2)
  } catch {
    return typeof args === 'string' ? args : String(args)
  }
}
