import type { DebugLogEntry } from '../stores/debugLog.store'

/** Local wall-clock time (HH:MM:SS.mmm) for a log entry — timezone-agnostic, no date noise. */
export function formatDebugTimestamp(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function argsToString(args: unknown): string {
  if (args === undefined) return ''
  if (typeof args === 'string') return args
  try {
    return JSON.stringify(args)
  } catch {
    return '[unserializable]'
  }
}

/** One entry rendered as a single copyable line (+ an indented error line when it failed). */
export function formatDebugLogEntry(entry: DebugLogEntry): string {
  const args = argsToString(entry.args)
  const head = `[${formatDebugTimestamp(entry.timestamp)}] ${entry.status.toUpperCase().padEnd(5)} ${entry.durationMs}ms  ${entry.command}${args ? ` ${args}` : ''}`
  return entry.error ? `${head}\n    ↳ ${entry.error}` : head
}

/**
 * The whole buffer as plain text for clipboard/export. Entries are stored newest-first; we emit
 * them oldest-first so the trace reads top-to-bottom in execution order.
 */
export function formatDebugLogText(entries: DebugLogEntry[]): string {
  return [...entries].reverse().map(formatDebugLogEntry).join('\n')
}
