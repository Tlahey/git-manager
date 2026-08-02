import {
  getBranches,
  getRebaseState,
  rebaseOntoCommit,
  continueRebase,
  abortRebase,
  skipRebase,
  listRebaseCommits,
  runInteractiveRebase,
} from '../../lib/tauri'
import type { RebaseTodoStep } from '@git-manager/git-types'
import { closeActivitySession, openActivitySession, runActivity } from '../../lib/activityCorrelation'
import { clearRedo, pendingRebasePreviousOid, settleRebase } from './gitApiShared'

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

export async function apiGetRebaseState(path: string) {
  return getRebaseState(path)
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
