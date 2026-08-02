import { checkFixupTarget, createFixupCommit, autosquashPreview, runAutosquash, getPendingFixups, getBranches, pinObject } from '../../lib/tauri'
import { callCommand } from '../service'
import { openActivitySession, runActivity } from '../../lib/activityCorrelation'
import {
  generateId,
  pushAction,
  clearRedo,
  pendingRebasePreviousOid,
  settleRebase,
} from './gitApiShared'

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
