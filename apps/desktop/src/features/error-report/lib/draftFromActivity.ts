import type { ActivityLogEntry } from '../../../stores/activityLog.store'
import type { ActivityBlock } from '../../../lib/groupActivityLog'
import type { ErrorReportDraft } from './buildReport'

/**
 * Builds a report draft out of a line in the Activity Logs — the "I saw it happen, report *that*
 * one" path.
 *
 * The log is a better source than a toast for this: it kept the failing operation's arguments, its
 * duration, and — through the correlation id — every other IPC call of the same user action. A
 * report built from it says "the pull did these nine things and the eighth failed", which is the
 * part a maintainer cannot reconstruct from a message alone.
 */

interface ParsedActivityError {
  code?: string
  message: string
  detail?: string
}

/**
 * Recovers the structured error from an activity entry's `error` string.
 *
 * `lib/tauri/invoke.ts` records the failure **before** unwrapping it, so what the log holds is the
 * raw serialization of `AppError` — `{"code":"GIT_ERROR","message":"…","detail":null}` — rather
 * than the readable message the call site got. That is lucky rather than deliberate, and it is
 * what makes the classification table usable from here: the `code` is still in there. A rejection
 * that isn't that shape (a JS error thrown before the IPC call) is passed through as its own
 * message, with no code — which the table treats as a bug, correctly.
 */
export function parseActivityError(error: string): ParsedActivityError {
  try {
    const parsed = JSON.parse(error)
    if (parsed && typeof parsed.message === 'string') {
      return {
        code: typeof parsed.code === 'string' ? parsed.code : undefined,
        message: parsed.message,
        detail: typeof parsed.detail === 'string' ? parsed.detail : undefined,
      }
    }
  } catch {
    // Not an AppError payload — see above.
  }
  return { message: error }
}

/**
 * `block` supplies the surrounding operations. Passing `undefined` still produces a valid draft
 * with the failing entry as its only context, so a caller that hasn't grouped the log doesn't have
 * to.
 */
export function draftFromActivityEntry(
  entry: ActivityLogEntry,
  block: ActivityBlock | undefined
): ErrorReportDraft {
  const { code, message, detail } = parseActivityError(entry.error ?? 'Unknown error')

  return {
    kind: 'operation',
    code,
    message,
    detail,
    command: entry.command,
    correlationLabel: entry.correlationLabel ?? block?.label,
    timestamp: entry.timestamp,
    repoPath: entry.repoPath,
    context: block?.entries ?? [entry],
  }
}
