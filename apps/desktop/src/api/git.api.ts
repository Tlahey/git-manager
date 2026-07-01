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
  stashPush,
  stashPop,
  stashList,
  stashApply,
  stashDrop,
  editStashMessage,
} from '../lib/tauri'
import { gameObserver } from '../lib/gameObserver'

export async function apiStageFile(path: string, filePath: string) {
  const result = await stageFile(path, filePath)
  gameObserver.notify('stage', { filePath })
  return result
}

export async function apiUnstageFile(path: string, filePath: string) {
  const result = await unstageFile(path, filePath)
  gameObserver.notify('unstage', { filePath })
  return result
}

export async function apiStageAll(path: string) {
  const result = await stageAll(path)
  gameObserver.notify('stage', { filePath: 'all' })
  return result
}

export async function apiUnstageAll(path: string) {
  const result = await unstageAll(path)
  gameObserver.notify('unstage', { filePath: 'all' })
  return result
}

export async function apiCreateCommit(path: string, message: string, amend = false, amendOid?: string) {
  const result = await createCommit(path, message, amend, amendOid)
  gameObserver.notify('commit')
  return result
}

export async function apiDiscardFileChanges(path: string, filePath: string) {
  const result = await discardFileChanges(path, filePath)
  gameObserver.notify('discard')
  return result
}

export async function apiCreateFixupCommit(path: string, targetOid: string) {
  const result = await createFixupCommit(path, targetOid)
  gameObserver.notify('fixup')
  return result
}

export async function apiAutosquashPreview(path: string) {
  return autosquashPreview(path)
}

export async function apiRunAutosquash(path: string) {
  const result = await runAutosquash(path)
  gameObserver.notify('autosquash')
  return result
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

export async function apiStashPush(path: string, message?: string, includeUntracked = false) {
  const result = await stashPush(path, message, includeUntracked)
  // Optionally notify gameObserver if there is a stash achievement/event
  return result
}

export async function apiStashPop(path: string, index?: number) {
  const result = await stashPop(path, index)
  return result
}

export async function apiStashApply(path: string, index?: number) {
  const result = await stashApply(path, index)
  return result
}

export async function apiStashDrop(path: string, index: number) {
  const result = await stashDrop(path, index)
  return result
}

export async function apiUpdateStashMessage(path: string, index: number, message: string) {
  const result = await editStashMessage(path, index, message)
  return result
}

export async function apiStashList(path: string) {
  return stashList(path)
}


