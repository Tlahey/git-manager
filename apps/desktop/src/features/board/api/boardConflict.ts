/**
 * The compare-and-swap failure both board backends raise, and the one way to recognise it.
 *
 * Every write that carries an `expectedRevision` can lose the race, and the caller has to be able to
 * tell that apart from a real failure: a conflict is recoverable by re-reading, anything else is not.
 * The signal is a `code` property rather than a message, so it survives the `Error`-to-string trip
 * across the Tauri boundary the local backend takes (`AppError` serializes to `{ code, … }` — see
 * `src-tauri/src/error.rs`) and is the same shape the remote backend produces client-side.
 */

export const BOARD_CONFLICT_CODE = 'BOARD_CONFLICT'

export function boardConflictError(message: string): Error {
  return Object.assign(new Error(message), { code: BOARD_CONFLICT_CODE })
}

export function isBoardConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === BOARD_CONFLICT_CODE
  )
}
