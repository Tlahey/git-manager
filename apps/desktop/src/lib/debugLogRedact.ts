/**
 * Sanitises the argument object of a Tauri IPC call before it's stored in the in-memory debug
 * log (see `stores/debugLog.store.ts`). The debug log is copy/exportable by the user, so it must
 * never leak credentials — SSH keys and tokens are supposed to stay in Rust, but a few command
 * arguments can still carry secrets (PATs, passphrases, remote URLs with embedded creds). We also
 * truncate large payloads (diffs, commit bodies, rebase todo lists) so 200 buffered entries can't
 * balloon memory or drown the useful signal.
 */

/** Commands whose entire argument object is dropped — anything auth/credential-shaped. */
const SENSITIVE_COMMAND = /token|password|secret|credential|ssh|oauth|github|passphrase/i

/** Individual argument keys redacted regardless of the command. */
const SENSITIVE_KEY = /token|password|secret|credential|passphrase|apikey|key/i

const MAX_STRING = 200

function truncate(value: string): string {
  return value.length > MAX_STRING
    ? `${value.slice(0, MAX_STRING)}… (${value.length} chars)`
    : value
}

function safeStringify(value: unknown): string {
  try {
    return truncate(JSON.stringify(value))
  } catch {
    return '[unserializable]'
  }
}

export function redactArgs(command: string, args: unknown): unknown {
  if (args === undefined || args === null) return args
  if (SENSITIVE_COMMAND.test(command)) return '[redacted]'
  if (typeof args !== 'object') {
    return typeof args === 'string' ? truncate(args) : args
  }

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]'
    } else if (typeof value === 'string') {
      out[key] = truncate(value)
    } else if (value !== null && typeof value === 'object') {
      // Nested objects/arrays (opts, rebase steps, …) are stringified and truncated rather than
      // kept by reference, to bound how much a single log entry can hold.
      out[key] = safeStringify(value)
    } else {
      out[key] = value
    }
  }
  return out
}
