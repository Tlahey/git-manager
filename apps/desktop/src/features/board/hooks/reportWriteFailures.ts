import { toast } from '@git-manager/ui'
import { isBoardConflict } from '../api/boardConflict'

/** Any of the board's action functions, as seen from here — the arguments are the caller's business. */
type BoardAction = (...args: never[]) => unknown

/**
 * Wraps every async function of a board-actions object so a failed write is *said out loud*.
 *
 * Without this, a rejected mutation went nowhere at all. Two thirds of the call sites are
 * fire-and-forget (`void updateCard(...)` from a field editor, from the card's `⋯` menu, from a drag)
 * where the rejection became an unhandled promise; the rest are dialog submits that simply stayed
 * open, pending state reset, with no clue that anything had gone wrong. `withConflictToast` even says
 * it re-throws "for the caller's own error handling" — and no caller had any.
 *
 * **It re-throws.** Reporting and handling are different jobs: the toast is what the user needs, and
 * the rejection is what keeps a dialog from closing on a write that never landed, and what lets an
 * operation like `moveCardToBoard` refuse to delete a local card whose remote twin failed. The only
 * thing that changes is that the failure becomes visible.
 *
 * A `BOARD_CONFLICT` is deliberately *not* reported here: `withConflictToast` already turns it into
 * its own message and a refresh, and a lost race is a recoverable non-event rather than a failure.
 * Toasting twice would claim something went wrong when the board simply moved on.
 */
export function reportWriteFailures<T extends object>(actions: T, message: string): T {
  const wrapped: Record<string, unknown> = {}

  for (const [name, value] of Object.entries(actions)) {
    if (typeof value !== 'function') {
      wrapped[name] = value
      continue
    }
    const action = value as BoardAction
    wrapped[name] = (...args: never[]) => {
      let result: unknown
      try {
        result = action(...args)
      } catch (error) {
        // A synchronous throw from a guard, before any promise exists.
        report(error, message)
        throw error
      }
      if (result instanceof Promise) {
        return result.catch((error: unknown) => {
          report(error, message)
          throw error
        })
      }
      return result
    }
  }

  return wrapped as T
}

function report(error: unknown, message: string): void {
  if (isBoardConflict(error)) return
  toast.error(message, { description: String(error) })
}
