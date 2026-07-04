import {
  listConflictedFiles,
  getMergeView,
  autoMergeConflictView,
  resolveConflict,
  resolveConflictBinary,
} from '../lib/tauri'

export async function apiListConflictedFiles(path: string) {
  return listConflictedFiles(path)
}

export async function apiGetMergeView(path: string, filePath: string) {
  return getMergeView(path, filePath)
}

export async function apiAutoMergeConflictView(path: string, filePath: string) {
  return autoMergeConflictView(path, filePath)
}

export async function apiResolveConflict(path: string, filePath: string, resolvedContent: string) {
  return resolveConflict(path, filePath, resolvedContent)
}

export async function apiResolveConflictBinary(path: string, filePath: string, side: 'ours' | 'theirs') {
  return resolveConflictBinary(path, filePath, side)
}
