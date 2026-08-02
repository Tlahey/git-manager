import {
  getCommitsBetween,
  cherryPickCommit,
  getRepoStatus,
  getPendingOperation,
  getLog,
  getCommitDiff,
  getCommitsMergedDiff,
  compareCommitToWorkdir,
  compareRefs,
  getFileDiff,
  getFileRawContents,
  getCommitFileVsWorkdir,
  getCommitFile,
  gitBlameFile,
  getFileHistory,
  listTrackedFiles,
  listSubmodules,
} from '../../lib/tauri'
import { clearRedo } from './gitApiShared'

export async function apiGetCommitsBetween(path: string, fromOid: string, toOid: string) {
  return getCommitsBetween(path, fromOid, toOid)
}

// ─── Cherry-pick ────────────────────────────────────────────────────────────

export async function apiCherryPickCommit(path: string, oid: string) {
  const result = await cherryPickCommit(path, oid)
  clearRedo(path)
  return result
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

/** `parentIndex` is 0-based and defaults to the first parent — the graph's "Compare against
 *  parent N" entries are the only callers that pass another, since only a merge commit has one. */
export async function apiGetCommitDiff(path: string, oid: string, parentIndex?: number) {
  return getCommitDiff(path, oid, parentIndex)
}

export async function apiGetCommitsMergedDiff(path: string, baseOid: string, headOid: string) {
  return getCommitsMergedDiff(path, baseOid, headOid)
}

export async function apiCompareCommitToWorkdir(path: string, oid: string) {
  return compareCommitToWorkdir(path, oid)
}

/** Diff between two arbitrary refs (branch vs branch, tag or SHA) — the branch comparison view. */
export async function apiCompareRefs(path: string, baseRef: string, headRef: string) {
  return compareRefs(path, baseRef, headRef)
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

export async function apiListSubmodules(path: string) {
  return listSubmodules(path)
}
