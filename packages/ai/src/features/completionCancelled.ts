/**
 * The marker a cancelled completion comes back with. Mirrors `COMPLETION_CANCELLED` in
 * `apps/desktop/src-tauri/src/commands/ai.rs`, which is where the value is defined and where the
 * reason it exists is recorded.
 *
 * A constant rather than prose because the distinction it carries is load-bearing on this side: a
 * user's stop and a model failure arrive at the same `catch`, and the map phases record failures as
 * marked, reportable results. Matching on a message would mean a translated or reworded provider
 * error could turn a cancellation into "this commit could not be read" — a claim the panel then
 * shows the user about their own repository.
 */
export const COMPLETION_CANCELLED = 'completion-cancelled'

/**
 * Whether a rejected AI call was stopped by the user rather than failed.
 *
 * Matches on the stringified error because that is all this package can do: the host's error payload
 * shape (`{ code, message, detail }` unwrapped into an `Error`) is deliberately unknown here — the
 * same division {@link AiCallTimedOut} takes, with the host translating and the package carrying the
 * taxonomy. The marker is specific enough that a substring test cannot false-positive on a provider
 * message.
 */
export function isCompletionCancelled(error: unknown): boolean {
  return String(error instanceof Error ? error.message : error).includes(COMPLETION_CANCELLED)
}
