import {
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  createCommit,
  discardFileChanges,
  getBranches,
  pinObject,
} from '../../lib/tauri'
import { callCommand } from '../service'
import { runActivity } from '../../lib/activityCorrelation'
import { generateId, pushAction, clearRedo, raiseHookFailureCard } from './gitApiShared'

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
