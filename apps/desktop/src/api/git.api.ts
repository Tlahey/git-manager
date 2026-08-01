import type { PullStrategy, RemoteOperation } from '../lib/tauri'
import {
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  createCommit,
  discardFileChanges,
  createFixupCommit,
  checkFixupTarget,
  autosquashPreview,
  runAutosquash,
  getPendingFixups,
  revertCommit,
  resetToCommit,
  getCommitsBetween,
  stashPush,
  stashPop,
  stashList,
  stashApply,
  stashDrop,
  editStashMessage,
  getBranches,
  checkoutBranch,
  deleteBranch,
  mergeBranch,
  fastForwardBranch,
  setBranchUpstream,
  pushBranchTo,
  getRemotes,
  removeRemote,
  pinObject,
  snapshotWorktree,
  snapshotWorktreeAlways,
  type WorktreeSnapshot,
  getPendingOperation,
  getRepoStatus,
  listTrackedFiles,
  getLog,
  getCommitDiff,
  getCommitsMergedDiff,
  getFileDiff,
  getFileRawContents,
  getCommitFileVsWorkdir,
  getCommitFile,
  gitBlameFile,
  getFileHistory,
  getTagContainingCommit,
  isCommitOnCurrentBranch,
  getTags,
  listSubmodules,
  getRebaseState,
  createBranch,
  renameBranch,
  createTag,
  deleteTag,
  deleteRemoteTag,
  pushTag,
  getTagWebUrl,
  getBranchWebUrl,
  fetchRemote,
  pullBranch,
  pushBranch,
  cherryPickCommit,
  compareCommitToWorkdir,
  getCommitWebUrl,
  rebaseOntoCommit,
  continueRebase,
  abortRebase,
  skipRebase,
  listRebaseCommits,
  runInteractiveRebase,
  getBisectState,
  bisectCheckRange,
  bisectStart,
  bisectMark,
  bisectReset,
  createPatch,
  createCommitsPatch,
  createWorkingPatch,
  previewWorkingPatch,
  readPatchFile,
  applyPatch,
  listPatchableDependencies,
  prepareDependencyPatch,
  commitDependencyPatch,
} from '../lib/tauri'
import type { RebaseTodoStep, BisectTerm } from '@git-manager/git-types'
import { callCommand } from './service'
import { closeActivitySession, openActivitySession, runActivity } from '../lib/activityCorrelation'
import { i18next, type TFunction } from '@git-manager/i18n'
import { useUndoHistoryStore } from '../stores/undoHistory.store'
import { useNotchQueueStore } from '../stores/notchQueue.store'
import { hookFailureFrom, hookFailureNotchModel } from '../lib/notifications/hookNotch'
import { repoNameOf } from '../lib/notifications/remoteNotch'
import { useRemoteProgressStore, type RemoteOperationOutcome } from '../stores/remoteProgress.store'
import type { UndoAction } from '../lib/undoActions'

// ─── Undo/Redo helpers ──────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function pushAction(repoPath: string, action: UndoAction) {
  useUndoHistoryStore.getState().push(repoPath, action)
}

function clearRedo(repoPath: string) {
  useUndoHistoryStore.getState().clearRedo(repoPath)
}

// Pre-rebase HEAD captured by apiRunInteractiveRebase/apiRunAutosquash, keyed by repoPath —
// survives a conflict/edit pause (both git2's rebase-related flows and the shelled-out
// `git rebase -i --autosquash` land in the same .git/rebase-merge state) so
// apiRebaseContinue/apiRebaseSkip can still record the undo entry once the rebase they finish
// actually settles back to idle. Cleared by settleRebase or on abort.
type PendingRebaseKind = 'interactiveRebase' | 'autosquash'
const pendingRebasePreviousOid = new Map<
  string,
  { previousOid: string | null; kind: PendingRebaseKind }
>()

/**
 * Called after every step of a rebase, to do the two things that can only be decided once git is
 * asked whether the rebase is *over*: record the undo entry, and close the activity-log session.
 *
 * They are settled together because they turn on the same question and it costs one IPC call to
 * answer. `kind !== 'idle'` means the rebase paused rather than landed — a conflict resolves without
 * throwing (`err_unless_paused`), so the call returning successfully proves nothing on its own.
 *
 * Unlike before, the state is read even with no pending undo entry: a plain `rebase_onto_commit`
 * registers none, and its session still has to be closed or every later action in that repository
 * would be swallowed into the finished rebase's block.
 */
async function settleRebase(path: string) {
  const rebaseState = await getRebaseState(path).catch(() => null)
  const stillRebasing = rebaseState ? rebaseState.kind !== 'idle' : false
  if (stillRebasing) return

  // Back to idle: the operation is over, so the journal's block for it ends here.
  closeActivitySession(path)

  const pending = pendingRebasePreviousOid.get(path)
  if (!pending) return

  pendingRebasePreviousOid.delete(path)
  const { previousOid, kind } = pending

  let newOid: string | null = null
  if (previousOid) {
    try {
      const branches = await getBranches(path, false)
      newOid = branches.find((b) => b.isHead)?.commitOid ?? null
    } catch {
      newOid = null
    }
  }

  if (previousOid && newOid && newOid !== previousOid) {
    const id = generateId()
    // The rebased HEAD isn't a descendant of the old tip, so both ends need their own pin to
    // survive GC.
    await Promise.all([
      pinObject(path, `${id}-previous`, previousOid).catch(() => {}),
      pinObject(path, `${id}-new`, newOid).catch(() => {}),
    ])
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: kind === 'autosquash' ? 'undoRedo.autosquash' : 'undoRedo.interactiveRebase' },
      pinnedRefs: [`${id}-previous`, `${id}-new`],
      type: kind,
      previousOid,
      newOid,
    })
  } else {
    clearRedo(path)
  }
}

/**
 * Puts a failed hook on the notch, if that is what the error was.
 *
 * Reads the translator off the i18n instance rather than a hook, because this runs from the API
 * layer where there is no component in scope — the same reason `notificationRouting.ts` reaches
 * for stores imperatively. Best-effort throughout: the caller is already on its way to rethrowing,
 * and a card that fails to render must not replace the real error.
 */
function raiseHookFailureCard(repoPath: string, error: unknown): void {
  try {
    const failure = hookFailureFrom(error)
    if (!failure) return
    const t = i18next.getFixedT(null, 'git') as unknown as TFunction
    useNotchQueueStore.getState().enqueue({
      model: hookFailureNotchModel(failure, repoNameOf(repoPath), t),
      importance: 'key',
    })
  } catch {
    // Nothing here is worth losing the commit error over.
  }
}

/**
 * Runs a push that has no transfer card of its own, putting a refused `pre-push` on the notch.
 *
 * The main Push button gets this for free: it goes through `trackTransfer`, whose failure card
 * already renders a hook's output rather than the error's own text. Dragging a ref onto another,
 * publishing a tag and deleting a remote tag do not go through it — their callers show
 * `String(error)`, which for a hook failure is the serialized `AppError` JSON, not the three lines
 * the hook actually printed. Until those paths get progress cards of their own, this is what keeps
 * a hook that refused them readable.
 *
 * The error is rethrown untouched: every caller here has its own dialog or toast to drive.
 */
async function withHookFailureCard<T>(repoPath: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    raiseHookFailureCard(repoPath, error)
    throw error
  }
}

// ─── Clipboard ──────────────────────────────────────────────────────────────

export async function apiCopyCommitSha(oid: string) {
  await navigator.clipboard.writeText(oid)
}

export async function apiStageFile(path: string, filePath: string) {
  return callCommand('stage', () => stageFile(path, filePath), { filePath })
}

export async function apiUnstageFile(path: string, filePath: string) {
  return callCommand('unstage', () => unstageFile(path, filePath), { filePath })
}

export async function apiStageAll(path: string) {
  return callCommand('stage', () => stageAll(path), { filePath: 'all' })
}

export async function apiUnstageAll(path: string) {
  return callCommand('unstage', () => unstageAll(path), { filePath: 'all' })
}

export async function apiCreateCommit(
  path: string,
  message: string,
  amend = false,
  amendOid?: string,
  /** `git commit --no-verify` — the escape hatch for a hook that hangs or misfires. */
  skipHooks?: boolean
) {
  return runActivity('git.commit', async () => {
    let previousOid: string | null = null
    if (!amend) {
      try {
        const branches = await getBranches(path, false)
        previousOid = branches.find((b) => b.isHead)?.commitOid ?? null
      } catch {
        previousOid = null
      }
    }

    let result
    try {
      result = await callCommand('commit', () =>
        createCommit(path, message, amend, amendOid, skipHooks)
      )
    } catch (error) {
      // A hook that refused is the one commit failure worth a card: the user pressed Commit,
      // nothing happened, and the reason is three lines of output the toast has no room for.
      // Raised here rather than at each call site because every commit in the app goes through
      // this function, and there are several.
      raiseHookFailureCard(path, error)
      throw error
    }

    if (amend) {
      // Amend is out of undo/redo's scope (only the initial commit is) — it already modifies a
      // commit that could itself be the result of an undo/redo.
      clearRedo(path)
    } else if (previousOid) {
      const id = generateId()
      // Pin the new commit: its parent (previousOid) automatically stays reachable as an ancestor
      // as long as newOid is protected.
      await pinObject(path, id, result.oid).catch(() => {})
      pushAction(path, {
        id,
        timestamp: Date.now(),
        label: { key: 'undoRedo.commit', params: { sha: result.shortOid } },
        pinnedRefs: [id],
        type: 'commit',
        previousOid,
        newOid: result.oid,
      })
    }

    return result
  })
}

export async function apiDiscardFileChanges(path: string, filePath: string) {
  const result = await callCommand('discard', () => discardFileChanges(path, filePath))

  if (result.snapshotBlobOid) {
    const id = generateId()
    const blobOid = result.snapshotBlobOid
    await pinObject(path, id, blobOid).catch(() => {})
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.discard', params: { file: filePath } },
      pinnedRefs: [id],
      type: 'discard',
      filePath,
      blobOid,
      wasStaged: result.wasStaged,
    })
  } else {
    clearRedo(path)
  }

  return result
}

export async function apiCheckFixupTarget(path: string, targetOid: string) {
  return checkFixupTarget(path, targetOid)
}

export async function apiCreateFixupCommit(path: string, targetOid: string, message?: string) {
  let previousOid: string | null = null
  try {
    const branches = await getBranches(path, false)
    previousOid = branches.find((b) => b.isHead)?.commitOid ?? null
  } catch {
    previousOid = null
  }

  const result = await callCommand('fixup', () => createFixupCommit(path, targetOid, message))

  if (previousOid) {
    const id = generateId()
    // A fixup is a perfectly normal commit on top of HEAD — same guarantees as a regular commit
    // (previousOid stays reachable as an ancestor as long as newOid is pinned).
    await pinObject(path, id, result.oid).catch(() => {})
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.fixup', params: { sha: result.shortOid } },
      pinnedRefs: [id],
      type: 'fixup',
      previousOid,
      newOid: result.oid,
    })
  } else {
    clearRedo(path)
  }

  return result
}

export async function apiAutosquashPreview(path: string) {
  return autosquashPreview(path)
}

export async function apiRunAutosquash(path: string) {
  openActivitySession(path, 'rebase')
  return runActivity('git.autosquash', async () => {
    let previousOid: string | null = null
    try {
      const branches = await getBranches(path, false)
      previousOid = branches.find((b) => b.isHead)?.commitOid ?? null
    } catch {
      previousOid = null
    }

    const result = await callCommand('autosquash', () => runAutosquash(path))

    // Same conflict-pause caveat as apiRunInteractiveRebase: `run_autosquash` shells out to
    // `git rebase -i --autosquash` and pauses gracefully (err_unless_paused) instead of erroring,
    // so HEAD may not have moved yet. Stash previousOid either way and let settleRebase record
    // the undo entry now, or later via apiRebaseContinue/apiRebaseSkip once it reaches idle.
    pendingRebasePreviousOid.set(path, { previousOid, kind: 'autosquash' })
    await settleRebase(path)

    return result
  })
}

export async function apiGetPendingFixups(path: string) {
  return getPendingFixups(path)
}

export async function apiRevertCommit(path: string, oid: string, noCommit = false) {
  let previousOid: string | null = null
  if (!noCommit) {
    try {
      const branches = await getBranches(path, false)
      previousOid = branches.find((b) => b.isHead)?.commitOid ?? null
    } catch {
      previousOid = null
    }
  }

  const result = await revertCommit(path, oid, noCommit)

  if (noCommit) {
    // With no commit, revert only modifies the index/working dir — no new commit to replay via
    // reset (same limitation as amend in apiCreateCommit).
    clearRedo(path)
    return result
  }

  let newOid: string | null = null
  try {
    const branches = await getBranches(path, false)
    newOid = branches.find((b) => b.isHead)?.commitOid ?? null
  } catch {
    newOid = null
  }

  if (previousOid && newOid && newOid !== previousOid) {
    const id = generateId()
    await Promise.all([
      pinObject(path, `${id}-previous`, previousOid).catch(() => {}),
      pinObject(path, `${id}-new`, newOid).catch(() => {}),
    ])
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.revert', params: { sha: result } },
      pinnedRefs: [`${id}-previous`, `${id}-new`],
      type: 'revert',
      previousOid,
      newOid,
    })
  } else {
    clearRedo(path)
  }

  return result
}

export async function apiResetToCommit(path: string, oid: string, mode: 'soft' | 'mixed' | 'hard') {
  return runActivity('git.reset', async () => {
    let previousOid: string | null = null
    try {
      const branches = await getBranches(path, false)
      previousOid = branches.find((b) => b.isHead)?.commitOid ?? null
    } catch {
      previousOid = null
    }

    const id = generateId()
    let snapshot: WorktreeSnapshot | null = null
    if (mode === 'hard') {
      snapshot = await snapshotWorktree(path, id)
    }

    if (previousOid) {
      // previousOid AND targetOid are pinned separately (no assumption of ancestry between the
      // two — a reset can target a commit that isn't a direct ancestor).
      await Promise.all([
        pinObject(path, `${id}-previous`, previousOid).catch(() => {}),
        pinObject(path, `${id}-target`, oid).catch(() => {}),
      ])
    }

    await resetToCommit(path, oid, mode)

    if (previousOid) {
      const pinnedRefs = [`${id}-previous`, `${id}-target`]
      if (snapshot) pinnedRefs.push(snapshot.indexRefName, snapshot.workdirRefName)
      pushAction(path, {
        id,
        timestamp: Date.now(),
        label: { key: 'undoRedo.reset', params: { sha: oid.slice(0, 7) } },
        pinnedRefs,
        type: 'reset',
        previousOid,
        targetOid: oid,
        mode,
        snapshot,
      })
    } else {
      clearRedo(path)
    }
  })
}

export async function apiGetCommitsBetween(path: string, fromOid: string, toOid: string) {
  return getCommitsBetween(path, fromOid, toOid)
}

// ─── Cherry-pick ────────────────────────────────────────────────────────────

export async function apiCherryPickCommit(path: string, oid: string) {
  const result = await cherryPickCommit(path, oid)
  clearRedo(path)
  return result
}

// ─── Rebase ─────────────────────────────────────────────────────────────────

export async function apiRebaseOntoCommit(path: string, targetOid: string) {
  // Opens the journal's session for the whole rebase — this call, and every step that drives it
  // forward once it pauses on a conflict. Closed by `settleRebase` when git is back to idle.
  openActivitySession(path, 'rebase')
  const result = await rebaseOntoCommit(path, targetOid)
  clearRedo(path)
  await settleRebase(path)
  return result
}

export async function apiRebaseContinue(path: string, message?: string) {
  // Idempotent: normally this joins the session its rebase opened. It only *creates* one when there
  // is none to join — the app was restarted mid-rebase, or the rebase was started from a terminal —
  // in which case the block honestly starts here rather than not existing.
  openActivitySession(path, 'rebase')
  const result = await continueRebase(path, message)
  await settleRebase(path)
  return result
}

export async function apiRebaseAbort(path: string) {
  // Abort restores HEAD to the pre-rebase tip itself, so there's nothing to record as an undo
  // entry — just forget the pending previousOid so it doesn't leak into a later rebase.
  pendingRebasePreviousOid.delete(path)
  openActivitySession(path, 'rebase')
  try {
    return await abortRebase(path)
  } finally {
    // Unconditionally, and without asking git: an abort ends the rebase whether it succeeded or
    // failed, and a session left open on a failed abort is the case that would swallow everything
    // the user does next.
    closeActivitySession(path)
  }
}

export async function apiRebaseSkip(path: string) {
  openActivitySession(path, 'rebase')
  const result = await skipRebase(path)
  await settleRebase(path)
  return result
}

// ─── Patch ──────────────────────────────────────────────────────────────────

export async function apiCreatePatch(path: string, oid: string, destPath: string) {
  return createPatch(path, oid, destPath)
}

/** Writes a patch spanning several commits (a multi-selection); `oids` ordered oldest→newest. */
export async function apiCreateCommitsPatch(path: string, oids: string[], destPath: string) {
  return createCommitsPatch(path, oids, destPath)
}

export async function apiCreateWorkingPatch(path: string, filePaths: string[], destPath: string) {
  return createWorkingPatch(path, filePaths, destPath)
}

export async function apiPreviewWorkingPatch(path: string, filePaths: string[]) {
  return previewWorkingPatch(path, filePaths)
}

export async function apiReadPatchFile(patchPath: string) {
  return readPatchFile(patchPath)
}

export async function apiApplyPatch(path: string, patchPath: string, checkOnly = false) {
  return applyPatch(path, patchPath, checkOnly)
}

export async function apiListPatchableDependencies(path: string) {
  return listPatchableDependencies(path)
}

export async function apiPrepareDependencyPatch(path: string, name: string, version: string) {
  return prepareDependencyPatch(path, name, version)
}

export async function apiCommitDependencyPatch(path: string, editDir: string) {
  return commitDependencyPatch(path, editDir)
}

export async function apiStashPush(path: string, message?: string, includeUntracked = false) {
  const result = await stashPush(path, message, includeUntracked)
  pushAction(path, {
    id: generateId(),
    timestamp: Date.now(),
    label: { key: 'undoRedo.stashPush', params: { message: message || 'WIP' } },
    pinnedRefs: [],
    type: 'stashPush',
    message,
    includeUntracked,
  })
  return result
}

export async function apiStashPop(path: string, index?: number) {
  const idx = index ?? 0
  const stashes = await stashList(path)
  const target = stashes.find((s) => s.index === idx)
  const id = generateId()
  const preSnapshot = await snapshotWorktreeAlways(path, id)

  if (target) {
    await pinObject(path, `${id}-stash`, target.commitOid).catch(() => {})
  }

  const result = await stashPop(path, index)

  if (target) {
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.stashPop', params: { message: target.message } },
      pinnedRefs: [`${id}-stash`, preSnapshot.indexRefName, preSnapshot.workdirRefName],
      type: 'stashPop',
      message: target.message,
      commitOid: target.commitOid,
      snapshot: preSnapshot,
    })
  } else {
    clearRedo(path)
  }

  return result
}

export async function apiStashApply(path: string, index?: number) {
  const idx = index ?? 0
  const id = generateId()
  const preSnapshot = await snapshotWorktreeAlways(path, id)

  const result = await stashApply(path, index)

  pushAction(path, {
    id,
    timestamp: Date.now(),
    label: { key: 'undoRedo.stashApply', params: { index: idx } },
    pinnedRefs: [preSnapshot.indexRefName, preSnapshot.workdirRefName],
    type: 'stashApply',
    index: idx,
    snapshot: preSnapshot,
  })

  return result
}

export async function apiStashDrop(path: string, index: number) {
  const stashes = await stashList(path)
  const target = stashes.find((s) => s.index === index)
  const id = generateId()

  if (target) {
    await pinObject(path, id, target.commitOid).catch(() => {})
  }

  const result = await stashDrop(path, index)

  if (target) {
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.stashDrop', params: { message: target.message } },
      pinnedRefs: [id],
      type: 'stashDrop',
      message: target.message,
      commitOid: target.commitOid,
    })
  } else {
    clearRedo(path)
  }

  return result
}

export async function apiUpdateStashMessage(path: string, index: number, message: string) {
  const result = await editStashMessage(path, index, message)
  return result
}

export async function apiStashList(path: string) {
  return stashList(path)
}

// ─── Checkout ──────────────────────────────────────────────────────────────

/** Where the checkout comes from — needed to record an undoable action (and to pin the commit
 * left behind when leaving a detached HEAD). Omitted for a checkout that shouldn't be undoable. */
export interface CheckoutOpts {
  fromRef: string
  fromDetached: boolean
  force?: boolean
}

export async function apiCheckoutBranch(path: string, toRef: string, opts?: CheckoutOpts) {
  return runActivity('git.checkout', async () => {
    const force = opts?.force ?? false
    const id = generateId()
    let snapshot: WorktreeSnapshot | null = null
    if (force) {
      snapshot = await snapshotWorktree(path, id)
    }
    if (opts?.fromDetached) {
      // The detached commit won't be referenced by any branch anymore once we leave it.
      await pinObject(path, `${id}-detached`, opts.fromRef).catch(() => {})
    }

    await checkoutBranch(path, toRef, force)

    if (opts) {
      const pinnedRefs: string[] = []
      if (snapshot) pinnedRefs.push(snapshot.indexRefName, snapshot.workdirRefName)
      if (opts.fromDetached) pinnedRefs.push(`${id}-detached`)

      pushAction(path, {
        id,
        timestamp: Date.now(),
        label: { key: 'undoRedo.checkout', params: { branch: toRef } },
        pinnedRefs,
        type: 'checkout',
        fromRef: opts.fromRef,
        toRef,
        force,
        snapshot,
      })
    } else {
      clearRedo(path)
    }
  })
}

// ─── Ref drag-and-drop integrations ──────────────────────────────────────────

/** Merges `source` into `target` (checks out `target` first). Rewrites the target ref, so
 * the snapshot-based undo doesn't apply — clear the redo stack like the other rewriting ops. */
export async function apiMergeBranch(path: string, source: string, target: string) {
  await mergeBranch(path, source, target)
  clearRedo(path)
}

/** Fast-forwards `target` up to `source` (ff-only; rejected if not an ancestor). */
export async function apiFastForwardBranch(path: string, source: string, target: string) {
  await fastForwardBranch(path, source, target)
  clearRedo(path)
}

/** Pushes local branch `source` to remote branch `target` (refspec `source:target`). */
export async function apiPushBranchTo(
  path: string,
  source: string,
  target: string,
  remote?: string,
  force?: boolean
) {
  await withHookFailureCard(path, () => pushBranchTo(path, source, target, remote, force))
}

// ─── Delete branch ─────────────────────────────────────────────────────────

export async function apiDeleteBranch(
  path: string,
  name: string,
  opts: { targetOid: string; upstream?: string; force?: boolean; deleteRemote?: boolean }
) {
  const id = generateId()
  // Pin before deleting: once the ref is gone, this commit can become unreachable.
  await pinObject(path, id, opts.targetOid).catch(() => {})

  await deleteBranch(path, name, opts.force ?? false, opts.deleteRemote ?? false)

  pushAction(path, {
    id,
    timestamp: Date.now(),
    label: { key: 'undoRedo.deleteBranch', params: { branch: name } },
    pinnedRefs: [id],
    type: 'deleteBranch',
    name,
    targetOid: opts.targetOid,
    upstream: opts.upstream,
  })
}

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

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function apiGetRepoStatus(path: string) {
  return getRepoStatus(path)
}

/**
 * The multi-step git operation the repo is in the middle of, or `null` when there is none.
 *
 * Ask this before a flow that writes several commits in a row: `apiCreateCommit` builds a
 * single-parent commit, so committing during a merge/cherry-pick/revert flattens it, and resetting
 * the index during a paused rebase discards conflict resolution. `apiGetRebaseState` answers a
 * narrower question and says nothing about a merge.
 */
export async function apiGetPendingOperation(path: string) {
  return getPendingOperation(path)
}

export async function apiGetLog(
  path: string,
  opts?: {
    limit?: number
    skip?: number
    branch?: string
    /** Solo mode: branch shortNames to isolate — graph loads only commits reachable from these. */
    soloBranches?: string[]
    author?: string
    showStashes?: boolean
    hiddenStashes?: string[]
    /** Whether a synthetic WIP / paused-rebase row will be rendered above the graph — an input
     * of the Rust column layout (seeds HEAD's lane at column 0 only when that row exists). */
    headHasWip?: boolean
  }
) {
  return getLog(path, opts)
}

export async function apiGetBranches(path: string, includeRemote = true) {
  return getBranches(path, includeRemote)
}

export async function apiGetCommitDiff(path: string, oid: string) {
  return getCommitDiff(path, oid)
}

export async function apiGetCommitsMergedDiff(path: string, baseOid: string, headOid: string) {
  return getCommitsMergedDiff(path, baseOid, headOid)
}

export async function apiCompareCommitToWorkdir(path: string, oid: string) {
  return compareCommitToWorkdir(path, oid)
}

export async function apiGetFileDiff(
  path: string,
  filePath: string,
  staged: boolean,
  oid?: string,
  baseOid?: string
) {
  return getFileDiff(path, filePath, staged, oid, baseOid)
}

export async function apiGetFileRawContents(
  path: string,
  filePath: string,
  staged: boolean,
  oid?: string,
  baseOid?: string
) {
  return getFileRawContents(path, filePath, staged, oid, baseOid)
}

export async function apiGetCommitFileVsWorkdir(path: string, oid: string, filePath: string) {
  return getCommitFileVsWorkdir(path, oid, filePath)
}

export async function apiGetCommitFile(path: string, oid: string, filePath: string) {
  return getCommitFile(path, oid, filePath)
}

export async function apiBlameFile(path: string, filePath: string, oid?: string) {
  return gitBlameFile(path, filePath, oid)
}

export async function apiGetFileHistory(path: string, filePath: string, limit?: number) {
  return getFileHistory(path, filePath, limit)
}

export async function apiListTrackedFiles(path: string) {
  return listTrackedFiles(path)
}

export async function apiGetTagContainingCommit(path: string, oid: string) {
  return getTagContainingCommit(path, oid)
}

export async function apiIsCommitOnCurrentBranch(path: string, oid: string) {
  return isCommitOnCurrentBranch(path, oid)
}

export async function apiGetTags(path: string) {
  return getTags(path)
}

export async function apiListSubmodules(path: string) {
  return listSubmodules(path)
}

export async function apiGetRebaseState(path: string) {
  return getRebaseState(path)
}

export async function apiGetBisectState(path: string) {
  return getBisectState(path)
}

export async function apiBisectCheckRange(path: string, badRev: string, goodRev: string) {
  return bisectCheckRange(path, badRev, goodRev)
}

export async function apiBisectStart(path: string, badRev: string, goodRev: string) {
  // A bisect is the other operation git keeps on-disk state for, so the journal treats it the same
  // way: one block from `start` through every `mark` to the `reset` that ends it.
  openActivitySession(path, 'bisect')
  return bisectStart(path, badRev, goodRev)
}

export async function apiBisectMark(path: string, term: BisectTerm) {
  openActivitySession(path, 'bisect')
  return bisectMark(path, term)
}

export async function apiBisectReset(path: string) {
  openActivitySession(path, 'bisect')
  try {
    return await bisectReset(path)
  } finally {
    // `reset` is the only thing that ends a bisect — git keeps the session alive even after the first
    // bad commit is found — so it is the one place this closes, and it closes either way.
    closeActivitySession(path)
  }
}

export async function apiListRebaseCommits(path: string, baseOid: string) {
  return listRebaseCommits(path, baseOid)
}

export async function apiRunInteractiveRebase(
  path: string,
  baseOid: string,
  steps: RebaseTodoStep[]
) {
  openActivitySession(path, 'rebase')
  return runActivity('git.rebaseInteractive', async () => {
    let previousOid: string | null = null
    try {
      const branches = await getBranches(path, false)
      previousOid = branches.find((b) => b.isHead)?.commitOid ?? null
    } catch {
      previousOid = null
    }

    const result = await runInteractiveRebase(path, baseOid, steps)

    // A conflict/edit pause resolves without throwing (err_unless_paused treats it as expected —
    // the ConflictResolutionPanel takes over from here), so HEAD may have moved to an
    // intermediate replay step without the rebase actually being done. Stash previousOid either
    // way: settleRebase records the undo entry now if it already settled, or later — via
    // apiRebaseContinue/apiRebaseSkip — once the paused rebase finally reaches idle.
    pendingRebasePreviousOid.set(path, { previousOid, kind: 'interactiveRebase' })
    await settleRebase(path)

    return result
  })
}

// ─── Branch creation ───────────────────────────────────────────────────────

export async function apiCreateBranch(path: string, name: string, fromRef: string) {
  await createBranch(path, name, fromRef)

  let targetOid: string | null = null
  try {
    const branches = await getBranches(path, false)
    targetOid = branches.find((b) => b.name === name)?.commitOid ?? null
  } catch {
    targetOid = null
  }

  if (targetOid) {
    const id = generateId()
    await pinObject(path, id, targetOid).catch(() => {})
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.createBranch', params: { branch: name } },
      pinnedRefs: [id],
      type: 'createBranch',
      name,
      targetOid,
    })
  } else {
    clearRedo(path)
  }
}

// ─── Branch rename ─────────────────────────────────────────────────────────

/** Renames a local branch. Not snapshot-undoable (a rename back restores it), so only clears redo. */
export async function apiRenameBranch(path: string, oldName: string, newName: string) {
  await renameBranch(path, oldName, newName)
  clearRedo(path)
}

// ─── Set upstream ────────────────────────────────────────────────────────────

/** Sets local branch `name`'s upstream to `upstream` (a remote-tracking branch's short name, e.g.
 * `origin/main`). Metadata-only — nothing to snapshot, so it only clears redo like the branch's
 * other non-rewriting relationship actions (rename, fast-forward). */
export async function apiSetBranchUpstream(path: string, name: string, upstream: string) {
  await setBranchUpstream(path, name, upstream)
  clearRedo(path)
}

// ─── Tag creation ──────────────────────────────────────────────────────────

export async function apiCreateTag(path: string, name: string, fromRef: string, message?: string) {
  await createTag(path, name, fromRef, message)

  let targetOid: string | null = null
  try {
    const tags = await getTags(path)
    targetOid = tags.find((t) => t.shortName === name)?.commitOid ?? null
  } catch {
    targetOid = null
  }

  if (targetOid) {
    const id = generateId()
    await pinObject(path, id, targetOid).catch(() => {})
    pushAction(path, {
      id,
      timestamp: Date.now(),
      label: { key: 'undoRedo.createTag', params: { tag: name } },
      pinnedRefs: [id],
      type: 'createTag',
      name,
      targetOid,
      message,
    })
  } else {
    clearRedo(path)
  }
}

/**
 * Deletes a local tag, pushing an undo entry that recreates it on `targetOid`. Pass `message` when
 * the tag is annotated so the undo restores an annotated tag; otherwise it is recreated lightweight.
 */
export async function apiDeleteTag(
  path: string,
  name: string,
  opts: { targetOid: string; message?: string }
) {
  const id = generateId()
  // Pin before deleting: once the ref is gone, this commit can become unreachable.
  await pinObject(path, id, opts.targetOid).catch(() => {})

  await deleteTag(path, name)

  pushAction(path, {
    id,
    timestamp: Date.now(),
    label: { key: 'undoRedo.deleteTag', params: { tag: name } },
    pinnedRefs: [id],
    type: 'deleteTag',
    name,
    targetOid: opts.targetOid,
    message: opts.message,
  })
}

/**
 * Turns an existing tag into an annotated one by recreating it with `message` on the same commit
 * (`git tag -d` + `git tag -a`). A replacement rather than an in-place edit, so it clears the redo
 * stack instead of pushing an invertible entry.
 */
export async function apiAnnotateTag(path: string, name: string, oid: string, message: string) {
  await deleteTag(path, name)
  await createTag(path, name, oid, message)
  clearRedo(path)
}

/** Deletes a tag on the remote (default "origin"). A network op, so it pushes no undo entry. */
export async function apiDeleteRemoteTag(path: string, tagName: string, remote?: string) {
  return withHookFailureCard(path, () => deleteRemoteTag(path, tagName, remote))
}

/** Publishes a tag to the remote (default "origin"). A network op, so it pushes no undo entry. */
export async function apiPushTag(path: string, tagName: string, remote?: string) {
  return withHookFailureCard(path, () => pushTag(path, tagName, remote))
}

/**
 * Re-points an existing tag at `oid`, keeping its name — the tag equivalent of a fast-forward.
 *
 * git has no "move a tag" primitive: it is a delete followed by a re-create, which is exactly what
 * {@link apiAnnotateTag} already does to attach a message. Only the local tag moves; the remote
 * still holds the old target until the tag is force-pushed, which this deliberately does not do.
 */
export async function apiMoveTag(path: string, tagName: string, oid: string) {
  await deleteTag(path, tagName)
  await createTag(path, tagName, oid)
  clearRedo(path)
}

/** The tag's GitHub release page URL on the remote (default "origin"), or null if unavailable. */
export async function apiGetTagWebUrl(path: string, tagName: string, remote?: string) {
  return getTagWebUrl(path, tagName, remote)
}

/** The branch's GitHub tree page URL on the remote (default "origin"), or null if unavailable. */
export async function apiGetBranchWebUrl(path: string, branchName: string, remote?: string) {
  return getBranchWebUrl(path, branchName, remote)
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
