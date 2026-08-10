import { invoke } from './invoke'

// ─── Remote ───────────────────────────────────────────────────────────────────

/**
 * What a transfer is doing. Mirrors the Rust `RemoteProgressPhase`.
 *
 * A fetch downloads objects and then resolves deltas locally; a push uploads. Three phases rather
 * than one bar because a single percentage that resets partway through reads as a bug.
 */
export type RemoteProgressPhase = 'receiving' | 'resolving' | 'writing'

/** Which operation a progress report belongs to. A pull's transfer *is* a fetch's, so the
 *  operation is carried explicitly rather than inferred. */
export type RemoteOperation = 'fetch' | 'pull' | 'push'

/** Payload of {@link REMOTE_PROGRESS_EVENT}. Mirrors the Rust `RemoteProgressEvent`. */
export interface RemoteProgressEvent {
  repoPath: string
  operation: RemoteOperation
  phase: RemoteProgressPhase
  completed: number
  /** `0` while the server hasn't announced a count — render that indeterminate, not as 0 %. */
  total: number
  bytes: number
}

/**
 * Pushed by `commands/remote.rs` while a transfer runs, rate-limited to a few times a second.
 *
 * Pushed rather than polled because a network transfer has no await point to interrogate, and the
 * command's own promise only settles when the whole thing is over — which on the transfers worth
 * reporting is minutes away.
 */
export const REMOTE_PROGRESS_EVENT = 'remote-progress'

/** Payload of {@link HOOK_PROGRESS_EVENT}. Mirrors the Rust `HookProgressEvent`. */
export interface HookProgressEvent {
  repoPath: string
  /** `pre-commit`, `commit-msg`, `pre-push`, … */
  name: string
  phase: 'started' | 'finished'
  /** Only on `finished`. */
  success?: boolean
}

/**
 * Pushed by `hook_progress.rs` when a repository hook starts and again when it stops.
 *
 * A hook is the one part of a commit or a push whose duration belongs to the user rather than to
 * this app — `lint-staged` over a large change, a test suite gating a push — and the command's own
 * promise only settles once it is over. Only ever sent for a hook that actually exists.
 */
export const HOOK_PROGRESS_EVENT = 'hook-progress'

export const fetchRemote = (path: string, remote?: string, prune?: boolean) =>
  invoke<{ remote: string; updatedRefs: string[] }>('fetch_remote', { path, remote, prune })

/**
 * How a pull integrates the fetched commits once the branch has diverged. Mirrors the Rust
 * `PullStrategy` (serialized kebab-case). None of them ever leave the repo paused on a conflict:
 * `fast-forward-only` refuses up front, the other two undo their work and report the paths.
 */
export type PullStrategy = 'fast-forward-if-possible' | 'fast-forward-only' | 'rebase'

export interface PullResult {
  fastForwarded: boolean
  commitsMerged: number
  conflicts: string[]
  /** A merge commit was created because the branches had diverged. */
  merged: boolean
  /** The local-only commits were replayed on top of the fetched tip. */
  rebased: boolean
}

export const pullBranch = (path: string, remote?: string, strategy?: PullStrategy) =>
  invoke<PullResult>('pull_branch', { path, remote, strategy })

/**
 * `skipHooks` is `git push --no-verify`.
 *
 * `pre-push` runs by default, which is the fix rather than the feature: libgit2 runs no hook of
 * any kind, so a repository's `pre-push` was silently skipped for every push made from this app
 * while the same push from a terminal ran it.
 */
export const pushBranch = (path: string, remote?: string, force?: boolean, skipHooks?: boolean) =>
  invoke<void>('push_branch', { path, remote, force, skipHooks })

export const pushBranchTo = (
  path: string,
  source: string,
  target: string,
  remote?: string,
  force?: boolean
) => invoke<void>('push_branch_to', { path, remote, source, target, force })

export interface RemoteInfo {
  name: string
  url: string
  pushUrl?: string
}

export const getRemotes = (path: string) => invoke<RemoteInfo[]>('get_remotes', { path })

export const addRemote = (path: string, name: string, url: string) =>
  invoke<void>('add_remote', { path, name, url })

export const removeRemote = (path: string, name: string) =>
  invoke<void>('remove_remote', { path, name })

export const getCommitWebUrl = (path: string, oid: string, remote?: string) =>
  invoke<string | null>('get_commit_web_url', { path, oid, remote })
