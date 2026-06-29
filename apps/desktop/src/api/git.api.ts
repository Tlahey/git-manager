import {
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  createCommit,
  discardFileChanges,
  createFixupCommit,
  autosquashPreview,
  runAutosquash,
  getPendingFixups,
  revertCommit,
  resetToCommit,
  getCommitsBetween,
} from '../lib/tauri'

export async function apiStageFile(path: string, filePath: string) {
  return stageFile(path, filePath)
}

export async function apiUnstageFile(path: string, filePath: string) {
  return unstageFile(path, filePath)
}

export async function apiStageAll(path: string) {
  return stageAll(path)
}

export async function apiUnstageAll(path: string) {
  return unstageAll(path)
}

export async function apiCreateCommit(path: string, message: string, amend = false, amendOid?: string) {
  return createCommit(path, message, amend, amendOid)
}

export async function apiDiscardFileChanges(path: string, filePath: string) {
  return discardFileChanges(path, filePath)
}

export async function apiCreateFixupCommit(path: string, targetOid: string) {
  return createFixupCommit(path, targetOid)
}

export async function apiAutosquashPreview(path: string) {
  return autosquashPreview(path)
}

export async function apiRunAutosquash(path: string) {
  return runAutosquash(path)
}

export async function apiGetPendingFixups(path: string) {
  return getPendingFixups(path)
}

export async function apiRevertCommit(path: string, oid: string, noCommit = false) {
  return revertCommit(path, oid, noCommit)
}

export async function apiResetToCommit(path: string, oid: string, mode: 'soft' | 'mixed' | 'hard') {
  return resetToCommit(path, oid, mode)
}

export async function apiGetCommitsBetween(path: string, fromOid: string, toOid: string) {
  return getCommitsBetween(path, fromOid, toOid)
}
