import {
  createPatch,
  createCommitsPatch,
  createWorkingPatch,
  previewWorkingPatch,
  readPatchFile,
  applyPatch,
  listPatchableDependencies,
  prepareDependencyPatch,
  commitDependencyPatch,
} from '../../lib/tauri'

export async function apiCreatePatch(path: string, oid: string, destPath: string) {
  return createPatch(path, oid, destPath)
}

/** Writes a patch spanning several commits (a multi-selection); `oids` ordered oldest→newest. */
export async function apiCreateCommitsPatch(path: string, oids: string[], destPath: string) {
  return createCommitsPatch(path, oids, destPath)
}

export async function apiCreateWorkingPatch(path: string, filePaths: string[], destPath: string) {
  return createWorkingPatch(path, filePaths, destPath)
}

export async function apiPreviewWorkingPatch(path: string, filePaths: string[]) {
  return previewWorkingPatch(path, filePaths)
}

export async function apiReadPatchFile(patchPath: string) {
  return readPatchFile(patchPath)
}

export async function apiApplyPatch(path: string, patchPath: string, checkOnly = false) {
  return applyPatch(path, patchPath, checkOnly)
}

export async function apiListPatchableDependencies(path: string) {
  return listPatchableDependencies(path)
}

export async function apiPrepareDependencyPatch(path: string, name: string, version: string) {
  return prepareDependencyPatch(path, name, version)
}

export async function apiCommitDependencyPatch(path: string, editDir: string) {
  return commitDependencyPatch(path, editDir)
}
