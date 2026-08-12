/**
 * Which failures are worth an issue on the project's tracker, keyed by the stable `code` every
 * backend error carries (`AppError` in `src-tauri/src/error.rs`, unwrapped into `AppErrorLike` by
 * `lib/tauri/invoke.ts`).
 *
 * **Why a table and not a judgement at each call site.** The app has ~90 `toast.error` call sites
 * and most of them report a condition the user created and can fix themselves: a protected branch
 * refusing a push, their own pre-commit hook exiting non-zero, an AI provider that isn't running,
 * a remote that timed out. Those are the app *working*. A "report this" button that treats them
 * the same as a crash would bury the real defects under reports nobody can act on, and the tracker
 * would stop being read — which costs more than having no reporting at all. Classifying by code in
 * one place means a new `AppError` variant is one line here rather than a decision re-taken badly
 * at each of the ninety sites.
 *
 * **Three verdicts, because two would lie.** `GIT_ERROR` wraps every single `git2::Error` — "you
 * have unstaged changes" and a genuine defect arrive under the same code, and no amount of string
 * matching separates them reliably. Calling it a bug floods the tracker; calling it expected hides
 * real breakage. `unclear` says so out loud and asks the reporter for the one thing the code can't
 * know: what they expected to happen.
 *
 * **An unknown code is a bug.** A code this table has never heard of is exactly the kind of thing
 * worth hearing about, so the default is `bug` rather than a silent `expected`.
 */

/** How a failure should be treated by the report dialog. */
export type ReportVerdict =
  /** A defect: report it. */
  | 'bug'
  /** Might be a defect, might be git refusing something reasonable — needs the reporter's words. */
  | 'unclear'
  /** The app behaving as designed, or the environment failing. Not a defect. */
  | 'expected'

interface Classification {
  verdict: ReportVerdict
  /** i18n key (in the `errors` namespace) explaining the verdict to the reporter. */
  reasonKey: string
}

/**
 * The one departure from "one code, one verdict": every code NOT listed is a `bug`. Listing the
 * bugs instead would mean a new `AppError` variant silently becomes unreportable.
 */
const CLASSIFICATION: Record<string, Classification> = {
  // ── Refusals by design ────────────────────────────────────────────────────────────────────
  PROTECTED_BRANCH: { verdict: 'expected', reasonKey: 'report.reason.protectedBranch' },
  // The user's own tooling decided this; its output is the message. Nothing for us to fix.
  HOOK_FAILED: { verdict: 'expected', reasonKey: 'report.reason.hookFailed' },
  // Concurrent write detected and rejected — the guard doing its job.
  BOARD_CONFLICT: { verdict: 'expected', reasonKey: 'report.reason.concurrentWrite' },
  TAG_ALREADY_EXISTS: { verdict: 'expected', reasonKey: 'report.reason.alreadyExists' },
  WORKTREE_PATH_EXISTS: { verdict: 'expected', reasonKey: 'report.reason.alreadyExists' },
  BOARD_ALREADY_EXISTS: { verdict: 'expected', reasonKey: 'report.reason.alreadyExists' },
  // Rejected input. A frontend that sent something malformed is our bug, but the overwhelmingly
  // common case is a value the user typed, and the dialog's "report anyway" covers the rest.
  INVALID_INPUT: { verdict: 'expected', reasonKey: 'report.reason.invalidInput' },

  // ── The environment, not the app ──────────────────────────────────────────────────────────
  AI_PROVIDER_ERROR: { verdict: 'expected', reasonKey: 'report.reason.aiProvider' },
  AI_TIMEOUT: { verdict: 'expected', reasonKey: 'report.reason.aiProvider' },
  HTTP_ERROR: { verdict: 'expected', reasonKey: 'report.reason.network' },
  NOTIFICATION_FAILED: { verdict: 'expected', reasonKey: 'report.reason.system' },
  // The folder moved, was deleted, or was never a repository.
  REPO_NOT_FOUND: { verdict: 'expected', reasonKey: 'report.reason.repoGone' },

  // ── Could be either ───────────────────────────────────────────────────────────────────────
  GIT_ERROR: { verdict: 'unclear', reasonKey: 'report.reason.gitRefusal' },
  IO_ERROR: { verdict: 'unclear', reasonKey: 'report.reason.io' },
  // A ref the app usually derives itself — but also one the user can type. Both happen.
  BRANCH_NOT_FOUND: { verdict: 'unclear', reasonKey: 'report.reason.refGone' },
  COMMIT_NOT_FOUND: { verdict: 'unclear', reasonKey: 'report.reason.refGone' },
  CONFLICT_NOT_FOUND: { verdict: 'unclear', reasonKey: 'report.reason.refGone' },
  BOARD_NOT_FOUND: { verdict: 'unclear', reasonKey: 'report.reason.refGone' },
  CARD_NOT_FOUND: { verdict: 'unclear', reasonKey: 'report.reason.refGone' },

  // ── Definitely ours ───────────────────────────────────────────────────────────────────────
  UNKNOWN: { verdict: 'bug', reasonKey: 'report.reason.unexpected' },
  UNPARSEABLE_CONFLICT: { verdict: 'bug', reasonKey: 'report.reason.unexpected' },
}

const UNCLASSIFIED: Classification = { verdict: 'bug', reasonKey: 'report.reason.unclassified' }

/** A UI crash never went through the backend, so it has no code — and is always a defect. */
const CRASH: Classification = { verdict: 'bug', reasonKey: 'report.reason.crash' }

/**
 * Classifies a failure. `code` is `AppErrorLike.code`; pass `undefined` for a UI crash or any
 * exception that never reached the backend.
 */
export function classifyError(
  code: string | undefined,
  kind: 'crash' | 'operation'
): Classification {
  if (kind === 'crash') return CRASH
  if (code === undefined) return UNCLASSIFIED
  return CLASSIFICATION[code] ?? UNCLASSIFIED
}
