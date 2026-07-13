import {
  resetToCommit,
  discardFileChanges,
  restoreFileBlob,
  stageFile,
  checkoutBranch,
  restoreWorktreeSnapshot,
  recreateBranchRef,
  deleteBranch,
  addRemote,
  removeRemote,
  stashPop,
  stashPush,
  stashApply,
  stashDrop,
  stashStore,
  createTag,
  deleteTag,
  type WorktreeSnapshot,
} from './tauri'

export type ResetMode = 'soft' | 'mixed' | 'hard'

/** Clé i18n (namespace 'git') + params, résolue via t() au moment de l'affichage du tooltip. */
export interface UndoLabel {
  key: string
  params?: Record<string, string | number>
}

interface ActionBase {
  id: string
  label: UndoLabel
  timestamp: number
  /** Refs cachées (refs/git-manager/undo/<name>) à libérer quand l'entrée sort de l'historique. */
  pinnedRefs: string[]
}

export type UndoAction = ActionBase &
  (
    | { type: 'commit'; previousOid: string; newOid: string }
    | { type: 'discard'; filePath: string; blobOid: string; wasStaged: boolean }
    | {
        type: 'checkout'
        fromRef: string
        toRef: string
        force: boolean
        snapshot: WorktreeSnapshot | null
      }
    | { type: 'deleteBranch'; name: string; targetOid: string; upstream?: string }
    | { type: 'removeRemote'; name: string; url: string }
    | {
        type: 'reset'
        previousOid: string
        targetOid: string
        mode: ResetMode
        snapshot: WorktreeSnapshot | null
      }
    | { type: 'stashPush'; message?: string; includeUntracked: boolean }
    | { type: 'stashPop'; message: string; commitOid: string; snapshot: WorktreeSnapshot }
    | { type: 'stashApply'; index: number; snapshot: WorktreeSnapshot }
    | { type: 'stashDrop'; message: string; commitOid: string }
    | { type: 'fixup'; previousOid: string; newOid: string }
    | { type: 'autosquash'; previousOid: string; newOid: string }
    | { type: 'interactiveRebase'; previousOid: string; newOid: string }
    | { type: 'revert'; previousOid: string; newOid: string }
    | { type: 'createBranch'; name: string; targetOid: string }
    | { type: 'createTag'; name: string; targetOid: string; message?: string }
  )

function snapshotOids(snapshot: WorktreeSnapshot | null): string[] {
  return snapshot ? [snapshot.indexTreeOid, snapshot.workdirTreeOid] : []
}

/** OID Git référencés par une entrée — utilisé pour la vérification de validité au démarrage. */
export function collectActionOids(action: UndoAction): string[] {
  switch (action.type) {
    case 'commit':
      return [action.previousOid, action.newOid]
    case 'discard':
      return [action.blobOid]
    case 'checkout':
      return snapshotOids(action.snapshot)
    case 'deleteBranch':
      return [action.targetOid]
    case 'removeRemote':
      return []
    case 'reset':
      return [action.previousOid, action.targetOid, ...snapshotOids(action.snapshot)]
    case 'stashPush':
      return []
    case 'stashPop':
      return [action.commitOid, ...snapshotOids(action.snapshot)]
    case 'stashApply':
      return snapshotOids(action.snapshot)
    case 'stashDrop':
      return [action.commitOid]
    case 'fixup':
    case 'autosquash':
    case 'interactiveRebase':
    case 'revert':
      return [action.previousOid, action.newOid]
    case 'createBranch':
    case 'createTag':
      return [action.targetOid]
  }
}

async function restoreWorktreeIfPresent(path: string, snapshot: WorktreeSnapshot | null) {
  if (snapshot) {
    await restoreWorktreeSnapshot(path, snapshot)
  }
}

export async function executeUndo(path: string, action: UndoAction): Promise<void> {
  switch (action.type) {
    case 'commit':
      await resetToCommit(path, action.previousOid, 'soft')
      return
    case 'discard':
      await restoreFileBlob(path, action.filePath, action.blobOid)
      if (action.wasStaged) {
        await stageFile(path, action.filePath)
      }
      return
    case 'checkout':
      await checkoutBranch(path, action.fromRef, action.force)
      await restoreWorktreeIfPresent(path, action.snapshot)
      return
    case 'deleteBranch':
      await recreateBranchRef(path, action.name, action.targetOid, action.upstream)
      return
    case 'removeRemote':
      await addRemote(path, action.name, action.url)
      return
    case 'reset':
      await resetToCommit(path, action.previousOid, action.mode)
      await restoreWorktreeIfPresent(path, action.snapshot)
      return
    case 'stashPush':
      await stashPop(path, 0)
      return
    case 'stashPop':
      await restoreWorktreeSnapshot(path, action.snapshot)
      await stashStore(path, action.commitOid, action.message)
      return
    case 'stashApply':
      await restoreWorktreeIfPresent(path, action.snapshot)
      return
    case 'stashDrop':
      await stashStore(path, action.commitOid, action.message)
      return
    case 'fixup':
    case 'autosquash':
    case 'interactiveRebase':
    case 'revert':
      await resetToCommit(path, action.previousOid, 'soft')
      return
    case 'createBranch':
      await deleteBranch(path, action.name, true, false)
      return
    case 'createTag':
      await deleteTag(path, action.name)
      return
  }
}

export async function executeRedo(path: string, action: UndoAction): Promise<void> {
  switch (action.type) {
    case 'commit':
      await resetToCommit(path, action.newOid, 'soft')
      return
    case 'discard':
      await discardFileChanges(path, action.filePath)
      return
    case 'checkout':
      await checkoutBranch(path, action.toRef, action.force)
      return
    case 'deleteBranch':
      await deleteBranch(path, action.name, true, false)
      return
    case 'removeRemote':
      await removeRemote(path, action.name)
      return
    case 'reset':
      await resetToCommit(path, action.targetOid, action.mode)
      return
    case 'stashPush':
      await stashPush(path, action.message, action.includeUntracked)
      return
    case 'stashPop':
      await stashPop(path, 0)
      return
    case 'stashApply':
      await stashApply(path, action.index)
      return
    case 'stashDrop':
      await stashDrop(path, 0)
      return
    case 'fixup':
    case 'autosquash':
    case 'interactiveRebase':
    case 'revert':
      await resetToCommit(path, action.newOid, 'soft')
      return
    case 'createBranch':
      await recreateBranchRef(path, action.name, action.targetOid)
      return
    case 'createTag':
      await createTag(path, action.name, action.targetOid, action.message)
      return
  }
}
