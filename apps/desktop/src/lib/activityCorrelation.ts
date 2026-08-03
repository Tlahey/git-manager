/**
 * Correlation context for the activity log, in two layers.
 *
 * **Per action** ({@link runActivity}). A user action (a pull, a commit, a checkout…) usually fans out
 * into several backend IPC calls; wrapping that action tags every `invoke` it issues with the same
 * `correlationId`, so the Activity Logs view and the action journal can group them into a single
 * readable block (see `stores/activityLog.store.ts` and `lib/groupActivityLog.ts`).
 *
 * **Per operation** ({@link openActivitySession}). Some git operations are not one action at all: a
 * rebase starts, *pauses on a conflict*, waits while the user resolves files and stages them, then
 * continues — possibly several times — and finally lands or is aborted. Those are separate user
 * actions, minutes apart, and `runActivity` structurally cannot span them: it is scoped to one async
 * function's lifetime. A session is an id that stays open across them, keyed by the repository it
 * belongs to, so the whole rebase reads as one thing.
 *
 * A session deliberately **reuses the same `correlationId` field** rather than adding a second one.
 * That is what makes everything downstream work unchanged: a session's steps simply share a
 * correlation id, and every consumer already groups on it. The alternative — a third nesting level of
 * process → action → command — would have had to be taught to the store, the grouper, the pool, the
 * journal and the prompt, to express something the existing field already expresses.
 *
 * Limitation: the browser has no `AsyncLocalStorage`, so the active per-action correlation is a
 * module-level value read synchronously at the start of each `invoke`. This is exact for the common
 * case (one user action whose IPC calls run in sequence), but two genuinely interleaved user actions
 * could cross-attribute — acceptable on a single-user desktop git client where that essentially never
 * happens. Sessions are not exposed to that: they are keyed by repository, not by call stack.
 */

export interface ActivityCorrelation {
  id: string
  label: string
}

let activeCorrelation: ActivityCorrelation | null = null
let seq = 0

/** The correlation currently in scope, captured by the `invoke` wrapper. */
export function getActiveCorrelation(): ActivityCorrelation | null {
  return activeCorrelation
}

/**
 * Run `fn` as a single correlated user action labelled `label`. Every `invoke` issued while `fn`
 * is on the stack shares one correlation id.
 *
 * **The outermost call wins.** A nested `runActivity` keeps the correlation already in scope
 * rather than opening a new one, because the outer call is the thing the user did: "create a
 * branch here" is one gesture, even though it runs `apiCreateBranch` and `apiCheckoutBranch`,
 * each of which wraps itself. Letting the inner calls take their own id split one gesture across
 * several ids, which cost real behaviour rather than just log tidiness — the undo stack groups on
 * this field (`UndoAction.correlationId`), so ⌘Z took back only the last operation of a gesture,
 * and for create-branch that meant asking git to delete a branch it had just made HEAD, which it
 * refuses. The label of the outermost call is the one that names the block, which is also the one
 * worth reading in the journal.
 */
export async function runActivity<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (activeCorrelation) return fn()
  activeCorrelation = { id: `corr-${Date.now()}-${seq++}`, label }
  try {
    return await fn()
  } finally {
    activeCorrelation = null
  }
}

// ─── Sessions: one multi-step git operation ───────────────────────────────────

/**
 * The multi-step operations worth holding a session open for.
 *
 * Both are operations git itself keeps *state on disk* for (`.git/rebase-merge`, `refs/bisect/*`) —
 * which is the test for belonging here, and why the list is short. A merge does not qualify: this app
 * aborts a conflicting merge rather than leaving it paused (see `commands/branch.rs`), so it is over
 * when its one call returns. A cherry-pick is a single call too.
 */
export type ActivitySessionKind = 'rebase' | 'bisect'

/** i18n-resolved elsewhere; these are the labels the journal titles a session block with. */
const SESSION_LABELS: Record<ActivitySessionKind, string> = {
  rebase: 'git.rebase',
  bisect: 'git.bisect',
}

/**
 * Which operations join a running session, per kind.
 *
 * An allowlist rather than "everything in the repository", because a paused operation does not
 * suspend the rest of the app: a user waiting on a conflict can still push another branch, and
 * swallowing that into the rebase's block would be worse than not grouping at all. What *is* in the
 * list is the work the pause exists for — for a rebase, settling the conflict, which means resolving
 * files and staging them, and is genuinely part of the rebase rather than an aside.
 *
 * That is also why the sets differ: a bisect involves no staging, so staging during one is unrelated
 * work and stays its own action.
 */
const SESSION_STEPS: Record<ActivitySessionKind, ReadonlySet<string>> = {
  rebase: new Set([
    // Starting it, and the three ways of driving it forward.
    'rebase_onto_commit',
    'run_interactive_rebase',
    'run_autosquash',
    'continue_rebase',
    'skip_rebase',
    'abort_rebase',
    // Settling the conflict a pause is waiting on: writing the merged file, or taking one side…
    'resolve_conflict',
    'resolve_conflict_binary',
    // …and telling git it is settled, which is what `git add` means mid-rebase.
    'stage_file',
    'stage_all',
    'unstage_file',
    'unstage_all',
    'discard_file_changes',
  ]),
  bisect: new Set(['bisect_start', 'bisect_mark', 'bisect_reset']),
}

interface OpenSession extends ActivityCorrelation {
  kind: ActivitySessionKind
}

/** repoPath → the operation currently open in it. At most one: git cannot rebase and bisect at once. */
const sessions = new Map<string, OpenSession>()

/**
 * Opens a session for `repoPath`, or leaves an existing one of the same kind alone.
 *
 * Idempotent on purpose, so the *steps* can call it as freely as the opener: a `continue_rebase` that
 * finds no session (the app was restarted mid-rebase, or the rebase was started outside the app)
 * opens one and the block starts from there, which is honest — while a `continue_rebase` during a
 * session it already belongs to must not start a second block.
 */
export function openActivitySession(repoPath: string, kind: ActivitySessionKind): void {
  const existing = sessions.get(repoPath)
  if (existing?.kind === kind) return
  sessions.set(repoPath, {
    id: `op-${Date.now()}-${seq++}`,
    label: SESSION_LABELS[kind],
    kind,
  })
}

/** Closes the session open for `repoPath`, if any. Called when the operation reaches its end — git
 * back to idle, or an explicit abort/reset. */
export function closeActivitySession(repoPath: string): void {
  sessions.delete(repoPath)
}

/**
 * The correlation `command` should carry because of a session running in its repository, or `null`.
 *
 * Takes the command, not just the repo, so the allowlist above decides. Returns an
 * {@link ActivityCorrelation} rather than the session itself because that is all the caller (the
 * `invoke` wrapper) needs, and it keeps the session's kind out of the log's shape.
 */
export function getActiveSession(
  repoPath: string | undefined,
  command: string
): ActivityCorrelation | null {
  if (repoPath === undefined) return null
  const session = sessions.get(repoPath)
  if (!session || !SESSION_STEPS[session.kind].has(command)) return null
  return { id: session.id, label: session.label }
}

/** Drops every open session. A test seam — module-level state would otherwise leak between cases. */
export function resetActivitySessions(): void {
  sessions.clear()
}
