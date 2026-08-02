import {
  getRemotes,
  removeRemote,
  getCommitWebUrl,
  fetchRemote,
  pullBranch,
  pushBranch,
  type PullStrategy,
  type RemoteOperation,
} from '../../lib/tauri'
import { runActivity } from '../../lib/activityCorrelation'
import { hookFailureFrom } from '../../lib/notifications/hookNotch'
import { useRemoteProgressStore, type RemoteOperationOutcome } from '../../stores/remoteProgress.store'
import { generateId, pushAction, clearRedo } from './gitApiShared'

// ─── Remotes ───────────────────────────────────────────────────────────────

export async function apiGetRemotes(path: string) {
  return getRemotes(path)
}

export async function apiGetCommitWebUrl(path: string, oid: string, remote?: string) {
  return getCommitWebUrl(path, oid, remote)
}

export async function apiRemoveRemote(path: string, name: string) {
  const remotes = await getRemotes(path)
  const remote = remotes.find((r) => r.name === name)

  await removeRemote(path, name)

  if (remote) {
    pushAction(path, {
      id: generateId(),
      timestamp: Date.now(),
      label: { key: 'undoRedo.removeRemote', params: { remote: name } },
      pinnedRefs: [],
      type: 'removeRemote',
      name: remote.name,
      url: remote.url,
    })
  } else {
    clearRedo(path)
  }
}

// ─── Fetch / Pull / Push ───────────────────────────────────────────────────

/**
 * Records a transfer's start and its outcome, around the call that performs it.
 *
 * The *progress* in between arrives on its own, pushed from Rust — but nothing on that channel can
 * say "this began" (the first report only comes once the server answers) or "this is over", and a
 * card with no end is worse than no card. So the two boundaries are taken here, at the one place
 * every fetch, pull and push already goes through.
 *
 * Recording is best-effort by construction: it wraps the call rather than gating it, so a store
 * that misbehaves cannot stop a push.
 */
/**
 * What the failed transfer's card shows: a hook's own output when that is what failed it — "the
 * pre-push hook stopped the operation" says nothing next to the three lines the hook printed —
 * and the error's own text otherwise (git's rejection message, a network failure, ...).
 */
function transferErrorMessage(error: unknown): string {
  const hookFailure = hookFailureFrom(error)
  return hookFailure ? hookFailure.lines.join('\n') : String(error)
}

async function trackTransfer<T>(
  path: string,
  operation: RemoteOperation,
  run: () => Promise<T>,
  summarise?: (result: T) => RemoteOperationOutcome,
  background = false
): Promise<T> {
  useRemoteProgressStore.getState().start(path, operation, background)
  try {
    const result = await run()
    useRemoteProgressStore
      .getState()
      .finish(path, operation, summarise?.(result) ?? { kind: 'success' })
    return result
  } catch (error) {
    useRemoteProgressStore
      .getState()
      .finish(path, operation, { kind: 'error', message: transferErrorMessage(error) })
    throw error
  }
}

/**
 * @param options.background - This fetch was scheduled, not asked for. Kept off the notch's live
 *   card; see `RemoteOperationEntry.background`.
 */
export async function apiFetchRemote(
  path: string,
  remote?: string,
  prune?: boolean,
  options?: { background?: boolean }
) {
  return trackTransfer(
    path,
    'fetch',
    () => runActivity('git.fetch', () => fetchRemote(path, remote, prune)),
    // The refs it moved are what make a finished fetch worth mentioning at all — one that changed
    // nothing has nothing to say.
    (result) => ({ kind: 'success', updatedRefs: result.updatedRefs }),
    options?.background ?? false
  )
}

export async function apiPullBranch(path: string, remote?: string, strategy?: PullStrategy) {
  return trackTransfer(path, 'pull', () =>
    runActivity('git.pull', () => pullBranch(path, remote, strategy))
  )
}

/** `skipHooks` is `git push --no-verify` — the escape hatch for a `pre-push` hook that hangs or
 *  misfires. */
export async function apiPushBranch(
  path: string,
  remote?: string,
  force?: boolean,
  skipHooks?: boolean
) {
  return trackTransfer(path, 'push', () =>
    runActivity('git.push', () => pushBranch(path, remote, force, skipHooks))
  )
}
