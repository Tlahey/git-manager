import { invoke } from './invoke'
import type { GitDiff } from '@git-manager/git-types'

// ─── Working Tree ─────────────────────────────────────────────────────────────

export const stageFile = (path: string, filePath: string) =>
  invoke<void>('stage_file', { path, filePath })

export const unstageFile = (path: string, filePath: string) =>
  invoke<void>('unstage_file', { path, filePath })

export interface DiscardResult {
  snapshotBlobOid: string | null
  wasUntracked: boolean
  wasStaged: boolean
}

export const discardFileChanges = (path: string, filePath: string) =>
  invoke<DiscardResult>('discard_file_changes', { path, filePath })

export const stageAll = (path: string) => invoke<void>('stage_all', { path })

export const unstageAll = (path: string) => invoke<void>('unstage_all', { path })

export interface CommitResult {
  oid: string
  shortOid: string
}

/**
 * `skipHooks` is `git commit --no-verify`.
 *
 * Hooks run by default, which is the fix rather than the feature: libgit2 runs no hook of any
 * kind, so a repository's `pre-commit` and `commit-msg` were silently skipped for every commit
 * made from this app while the same commit from a terminal ran them.
 */
export const createCommit = (
  path: string,
  message: string,
  amend = false,
  amendOid?: string,
  skipHooks?: boolean
) => invoke<CommitResult>('create_commit', { path, message, amend, amendOid, skipHooks })

export const getStagedDiff = (path: string) => invoke<GitDiff>('get_staged_diff', { path })

export const getFileDiff = (
  path: string,
  filePath: string,
  staged: boolean,
  oid?: string,
  // Present only for a merged multi-commit selection: scopes the diff's "before" side to the
  // oldest selected commit's first parent (see the `get_file_diff` Rust command).
  baseOid?: string
) =>
  invoke<import('@git-manager/git-types').GitDiffFile>('get_file_diff', {
    path,
    filePath,
    staged,
    oid,
    baseOid,
  })

export interface RawFileDiffContents {
  original: string
  modified: string
}

export const getFileRawContents = (
  path: string,
  filePath: string,
  staged: boolean,
  oid?: string,
  baseOid?: string
) => invoke<RawFileDiffContents>('get_file_raw_contents', { path, filePath, staged, oid, baseOid })

/** Target commit's version of a file (original) vs the current working-tree version (modified). */
export const getCommitFileVsWorkdir = (path: string, oid: string, filePath: string) =>
  invoke<RawFileDiffContents>('get_commit_file_vs_workdir', { path, oid, filePath })

// ─── Patch ────────────────────────────────────────────────────────────────────

export const createPatch = (path: string, oid: string, destPath: string) =>
  invoke<void>('create_patch', { path, oid, destPath })

/** Patch spanning several commits (a multi-selection). `oids` ordered oldest→newest. */
export const createCommitsPatch = (path: string, oids: string[], destPath: string) =>
  invoke<void>('create_commits_patch', { path, oids, destPath })

export const createWorkingPatch = (path: string, filePaths: string[], destPath: string) =>
  invoke<void>('create_working_patch', { path, filePaths, destPath })

export const previewWorkingPatch = (path: string, filePaths: string[]) =>
  invoke<string>('preview_working_patch', { path, filePaths })

export const readPatchFile = (patchPath: string) => invoke<string>('read_patch_file', { patchPath })

export const applyPatch = (path: string, patchPath: string, checkOnly: boolean) =>
  invoke<void>('apply_patch', { path, patchPath, checkOnly })

export const listPatchableDependencies = (path: string) =>
  invoke<import('@git-manager/git-types').PatchableDependency[]>('list_patchable_dependencies', {
    path,
  })

export const prepareDependencyPatch = (path: string, name: string, version: string) =>
  invoke<import('@git-manager/git-types').PreparedDependencyPatch>('prepare_dependency_patch', {
    path,
    name,
    version,
  })

export const commitDependencyPatch = (path: string, editDir: string) =>
  invoke<import('@git-manager/git-types').CommittedDependencyPatch>('commit_dependency_patch', {
    path,
    editDir,
  })
