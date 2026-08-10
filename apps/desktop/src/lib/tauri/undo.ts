import { invoke } from './invoke'

// ─── Undo/Redo snapshots ──────────────────────────────────────────────────────

export interface FileSnapshotResult {
  blobOid: string
  refName: string
}

export const snapshotFile = (path: string, filePath: string, entryId: string) =>
  invoke<FileSnapshotResult | null>('snapshot_file', { path, filePath, entryId })

export const restoreFileBlob = (path: string, filePath: string, blobOid: string) =>
  invoke<void>('restore_file_blob', { path, filePath, blobOid })

export interface WorktreeSnapshot {
  indexTreeOid: string
  workdirTreeOid: string
  indexRefName: string
  workdirRefName: string
}

export const snapshotWorktree = (path: string, entryId: string) =>
  invoke<WorktreeSnapshot | null>('snapshot_worktree', { path, entryId })

export const snapshotWorktreeAlways = (path: string, entryId: string) =>
  invoke<WorktreeSnapshot>('snapshot_worktree_always', { path, entryId })

export const restoreWorktreeSnapshot = (path: string, snapshot: WorktreeSnapshot) =>
  invoke<void>('restore_worktree_snapshot', {
    path,
    indexTreeOid: snapshot.indexTreeOid,
    workdirTreeOid: snapshot.workdirTreeOid,
  })

// ─── Undo/Redo persistence (pinning + validation) ─────────────────────────────

export const pinObject = (path: string, refName: string, oid: string) =>
  invoke<void>('pin_object', { path, refName, oid })

/** Resolves a revision (`HEAD`, a branch/tag name, a short sha) to its full commit OID. */
export const resolveRevision = (path: string, revision: string) =>
  invoke<string>('resolve_revision', { path, revision })

export const unpinObject = (path: string, refName: string) =>
  invoke<void>('unpin_object', { path, refName })

export const objectsExist = (path: string, oids: string[]) =>
  invoke<boolean[]>('objects_exist', { path, oids })

// ─── Rollback ─────────────────────────────────────────────────────────────────

export interface CommitSummary {
  oid: string
  shortOid: string
  subject: string
  authorName: string
  timestamp: number
}

/** `mainline` is `git revert -m`: the 1-based parent a MERGE commit is reverted relative to. It is
 *  required for a merge and ignored otherwise (see the Rust `git_rollback::revert_commit`). */
export const revertCommit = (path: string, oid: string, noCommit = false, mainline?: number) =>
  invoke<string>('revert_commit', { path, oid, noCommit, mainline })

export const resetToCommit = (path: string, oid: string, mode: 'soft' | 'mixed' | 'hard') =>
  invoke<void>('reset_to_commit', { path, oid, mode })

export const getCommitsBetween = (path: string, fromOid: string, toOid: string) =>
  invoke<CommitSummary[]>('get_commits_between', { path, fromOid, toOid })
