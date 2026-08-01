/**
 * A repository hook that stopped an operation, as a notch card.
 *
 * The first producer whose subject is the user's *own* tooling rather than git or GitHub — and the
 * one where the output matters more than the headline. "The pre-commit hook stopped the operation"
 * tells someone nothing they can act on; the three lines lint-staged printed tell them exactly
 * which file and which rule.
 */

import type { NotchProgressModel, NotchStatusModel } from '@git-manager/notch'
import { STATUS_OUTPUT_MAX_LINES } from '@git-manager/notch'
import type { TFunction } from '@git-manager/i18n'
import type { AppErrorLike } from '../tauri'

export interface HookFailure {
  /** `pre-commit`, `commit-msg`, … */
  name: string
  /** The tail of what the hook printed. */
  lines: string[]
}

/**
 * The hook's name, out of the message Rust produced for `AppError::HookFailed`.
 *
 * Parsed rather than carried in its own field because the error payload the two sides share is
 * `{ code, message, detail }` and widening it for one variant would touch every error in the app.
 * The message is ours, not git's, so its shape is a contract between these two files — and an
 * unrecognised one falls back rather than throwing.
 */
export function hookNameFrom(message: string): string {
  return /^The (.+?) hook\b/.exec(message)?.[1] ?? 'git'
}

/**
 * Reads a hook failure out of a rejected IPC call, or `null` when that is not what went wrong.
 *
 * Keys off the error *code*, not the message: the code is the stable half of the payload, and a
 * message match would break the moment the copy changed.
 */
export function hookFailureFrom(error: unknown): HookFailure | null {
  if (!(error instanceof Error)) return null
  const app = error as AppErrorLike
  if (app.code !== 'HOOK_FAILED') return null

  return {
    name: hookNameFrom(app.message),
    lines: (app.detail ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-STATUS_OUTPUT_MAX_LINES),
  }
}

/**
 * The card for a hook that refused an operation.
 *
 * `error` tone and — where the queue is concerned — the highest priority there is: this one card
 * is the difference between "my commit went through" and "my commit did not, and here is why". It
 * cuts in front of whatever else is showing, which is exactly what the tone is for.
 */
export function hookFailureNotchModel(
  failure: HookFailure,
  repoName: string,
  t: TFunction
): NotchStatusModel {
  return {
    kind: 'status',
    // Per hook, per repository: two repositories failing their own pre-commit are two facts.
    id: `hook:${repoName}:${failure.name}`,
    tone: 'error',
    eyebrow: t('hooks.notch.eyebrow', { name: failure.name }),
    context: repoName,
    title: t('hooks.notch.failed'),
    ...(failure.lines.length > 0 ? { outputLines: failure.lines } : {}),
    actions: [{ id: 'activate', label: t('hooks.notch.open'), variant: 'primary' }],
  }
}

/**
 * The card for a hook that is *running*, as opposed to one that already refused.
 *
 * A `progress` card with no ratio: a hook gives no progress of its own — it is somebody else's
 * script, and all this app knows is that it started. That is deliberately enough. Before this
 * existed there was nothing at all between pressing Commit and the commit landing, so a
 * `lint-staged` over a large change was an app that looked frozen for however long it took.
 *
 * `progress` also earns it the two behaviours that matter here: the presenter arms no dismissal
 * timer for a live card, so it cannot vanish while the hook is still going, and the delivery policy
 * never flattens it into an OS banner, which would mean one banner per hook.
 */
export function runningHookNotchModel(
  hookName: string,
  repoName: string,
  t: TFunction
): NotchProgressModel {
  return {
    kind: 'progress',
    // Per hook, per repository — the same shape as the failure card, so a hook that starts and then
    // refuses does not leave two cards behind.
    id: `hook-running:${repoName}:${hookName}`,
    tone: 'running',
    eyebrow: t('hooks.notch.eyebrow', { name: hookName }),
    context: repoName,
    title: t('hooks.notch.running'),
  }
}
