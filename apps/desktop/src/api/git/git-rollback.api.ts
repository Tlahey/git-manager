import {
  revertCommit,
  resetToCommit,
  getBranches,
  pinObject,
  snapshotWorktree,
  type WorktreeSnapshot,
} from '../../lib/tauri'
import { runActivity } from '../../lib/activityCorrelation'
import { generateId, pushAction, clearRedo } from './gitApiShared'

/**
 * `mainline` is `git revert -m` — which parent a MERGE commit is reverted relative to (1-based).
 * The backend refuses a merge without it and ignores it everywhere else, so a caller that has no
 * merge on its hands can keep leaving it out.
 */
export async function apiRevertCommit(
  path: string,
  oid: string,
  noCommit = false,
  mainline?: number
) {
  let previousOid: string | null = null
  if (!noCommit) {
    try {
      const branches = await getBranches(path, false)
      previousOid = branches.find((b) => b.isHead)?.commitOid ?? null
    } catch {
      previousOid = null
    }
  }

  const result = await revertCommit(path, oid, noCommit, mainline)

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
