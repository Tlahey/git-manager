import {
  getBranches,
  getRebaseState,
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
} from '../lib/tauri'
import type { RebaseTodoStep, BisectTerm } from '@git-manager/git-types'
import { closeActivitySession, openActivitySession, runActivity } from '../lib/activityCorrelation'
import { clearRedo, pendingRebasePreviousOid, settleRebase } from './git/gitApiShared'

export * from './git/git-commit.api'
export * from './git/git-fixup.api'
export * from './git/git-rollback.api'

export * from './git/git-log.api'

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

export * from './git/git-patch.api'

export * from './git/git-stash.api'

export * from './git/git-branch.api'

export * from './git/git-remote.api'

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

