import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { useActivityLogStore } from '../../stores/activityLog.store'
import { getActiveCorrelation, getActiveSession } from '../activityCorrelation'
import { persistActivityEntry } from '../activityLogPersistence'
import { redactArgs } from '../debugLogRedact'

/**
 * Single chokepoint for every frontend→backend call. Wraps Tauri's `invoke` so the activity log
 * (`stores/activityLog.store.ts`, surfaced in the footer's Activity Logs view) can record the
 * command name, redacted arguments, duration, targeted repository and success/error of each IPC
 * round-trip — capturing 100% of what the app asks the backend to do (git2 and shell-outs alike),
 * which is otherwise invisible from outside the native window. Calls made inside a `runActivity`
 * block (`lib/activityCorrelation.ts`) are additionally tagged so they group into one action.
 * Capture is always on — there is no disable switch.
 *
 * **Exported only so the sibling wrapper modules in this folder can use it.** It is deliberately
 * kept out of `lib/tauri`'s barrel, so importing it means naming this file — which is the visible
 * marker that something is going around the typed wrappers. It was module-private before the split
 * and that is one degree of protection the split costs; the layering rule it serves is unchanged
 * (see CLAUDE.md: components, hooks and stores go through `api/*.api.ts`, which is also where
 * undo/redo and the achievements event bus hang off). `lib/activityLogPersistence.ts` is the one
 * sanctioned exception, and says so where it takes it.
 */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const start = performance.now()
  try {
    // Preserve the exact call shape (no trailing `undefined`) so no-arg commands still forward as
    // `invoke('cmd')` rather than `invoke('cmd', undefined)`.
    const result =
      args === undefined ? await tauriInvoke<T>(command) : await tauriInvoke<T>(command, args)
    record(command, args, start, 'ok')
    return result
  } catch (err) {
    const rawMessage = String(err)
    record(command, args, start, 'error', rawMessage)
    throw toReadableError(err, rawMessage)
  }
}

/**
 * Every Tauri command rejects with `AppError`'s JSON serialization (`{ code, message, detail }`,
 * see `error.rs`), not a plain `Error` — so `String(err)` on it is the raw blob, e.g.
 * `{"code":"GIT_ERROR","message":"...","detail":null}`. Unwrapped once here so every call site's
 * `toast.error(String(err))` shows just the `message` field for free (`String()` on a real `Error`
 * returns its `.message` via `Error.prototype.toString`). A rejection that isn't that JSON shape —
 * e.g. a plain JS `Error` thrown before the IPC call ever reached the backend — passes through
 * unchanged.
 */
function toReadableError(err: unknown, rawMessage: string): unknown {
  try {
    const parsed = JSON.parse(rawMessage)
    if (parsed && typeof parsed.message === 'string') {
      const error = new Error(parsed.message) as AppErrorLike
      // `code` and `detail` used to be dropped here, which made them unreachable from any call
      // site — the payload was flattened to its `message` and the rest thrown away. That was
      // invisible until something needed the long version: a failed hook's own output, which *is*
      // the error as far as the user is concerned ("pre-commit failed" says nothing; the three
      // lines it printed say everything).
      if (typeof parsed.code === 'string') error.code = parsed.code
      if (typeof parsed.detail === 'string') error.detail = parsed.detail
      return error
    }
  } catch {
    // Not JSON: not an AppError payload, nothing to unwrap.
  }
  return err
}

/** An `Error` carrying the rest of an `AppError` payload. See `toReadableError`. */
export interface AppErrorLike extends Error {
  /** The `AppError` variant's stable code, e.g. `HOOK_FAILED`. */
  code?: string
  /** The long form, when the variant has one. Newline-separated. */
  detail?: string
}

function record(
  command: string,
  args: Record<string, unknown> | undefined,
  start: number,
  status: 'ok' | 'error',
  error?: string
) {
  const store = useActivityLogStore.getState()
  const repoPath = repoPathOf(args)
  // A multi-step operation running in this repository wins over the per-action correlation, because
  // it is the larger truth: the `git.rebaseInteractive` action that *starts* a rebase, and the
  // `git add` that settles a conflict three minutes later, are both the same rebase. See
  // `activityCorrelation.ts` — only the operations on that module's allowlist are captured this way,
  // so an unrelated push during a paused rebase keeps its own identity.
  const correlation = getActiveSession(repoPath, command) ?? getActiveCorrelation()
  store.add({
    command,
    args: redactArgs(command, args),
    durationMs: Math.round(performance.now() - start),
    status,
    error,
    repoPath,
    correlationId: correlation?.id,
    correlationLabel: correlation?.label,
  })
  // Stream the entry just stored (now carrying its generated id + timestamp) to the rotating
  // on-disk log. Best-effort and fire-and-forget — see `activityLogPersistence.ts`.
  persistActivityEntry(useActivityLogStore.getState().entries[0])
}

/**
 * Records a synthetic Activity Logs entry for an operation that does NOT go through `invoke` — e.g.
 * the Tauri updater/process/app plugins, which the frontend calls directly (see `updater.api.ts`).
 * Without this those calls (and their failures) would be invisible in the journal. `durationMs`
 * defaults to 0 for instantaneous operations.
 */
export function recordActivity(
  command: string,
  status: 'ok' | 'error',
  options: { durationMs?: number; error?: string } = {}
) {
  const correlation = getActiveCorrelation()
  useActivityLogStore.getState().add({
    command,
    durationMs: options.durationMs ?? 0,
    status,
    error: options.error,
    correlationId: correlation?.id,
    correlationLabel: correlation?.label,
  })
  persistActivityEntry(useActivityLogStore.getState().entries[0])
}

/**
 * The repository an IPC call targets, read from the conventional `path`/`repoPath` argument (never
 * sensitive). Lets the Activity Logs view scope down to the active repository's operations.
 */
function repoPathOf(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined
  const candidate = args.path ?? args.repoPath
  return typeof candidate === 'string' ? candidate : undefined
}
