import { invoke } from '@tauri-apps/api/core'
import type {
  GitRepo,
  GitStatus,
  GitGraphNode,
  GitBranch,
  GitRef,
  GitDiff,
  GitStash,
  GitWorktree,
  GitSubmodule,
  RebaseStep,
  RebaseState,
  OllamaStatus,
  AppSettings,
  UserTheme,
} from '@git-manager/git-types'

// ─── Repository ───────────────────────────────────────────────────────────────

export const openRepo = (path: string) => invoke<GitRepo>('open_repo', { path })

export const getRepoStatus = (path: string) => invoke<GitStatus>('get_repo_status', { path })

export const scanRepos = (rootPath: string, maxDepth: number) =>
  invoke<string[]>('scan_repos', { rootPath, maxDepth })

export const cloneRepo = (url: string, destPath: string) =>
  invoke<GitRepo>('clone_repo', { url, destPath })

export const initRepo = (path: string) => invoke<GitRepo>('init_repo', { path })

// ─── Log / Graph ──────────────────────────────────────────────────────────────

export const getLog = (
  path: string,
  opts?: { limit?: number; skip?: number; branch?: string; author?: string }
) => invoke<GitGraphNode[]>('get_log', { path, ...opts })

export const getCommitDiff = (path: string, oid: string) =>
  invoke<GitDiff>('get_commit_diff', { path, oid })

export const getCommitFile = (path: string, oid: string, filePath: string) =>
  invoke<string>('get_commit_file', { path, oid, filePath })

// ─── Branches ─────────────────────────────────────────────────────────────────

export const getBranches = (path: string, includeRemote = true) =>
  invoke<GitBranch[]>('get_branches', { path, includeRemote })

export const getTags = (path: string) => invoke<GitRef[]>('get_tags', { path })

export const createBranch = (path: string, name: string, fromRef: string) =>
  invoke<void>('create_branch', { path, name, fromRef })

export const checkoutBranch = (path: string, name: string, force = false) =>
  invoke<void>('checkout_branch', { path, name, force })

export const deleteBranch = (path: string, name: string, force = false, deleteRemote = false) =>
  invoke<void>('delete_branch', { path, name, force, deleteRemote })

export const renameBranch = (path: string, oldName: string, newName: string) =>
  invoke<void>('rename_branch', { path, oldName, newName })

// ─── Stash ────────────────────────────────────────────────────────────────────

export const stashList = (path: string) => invoke<GitStash[]>('stash_list', { path })

export const stashPush = (path: string, message?: string, includeUntracked = false) =>
  invoke<void>('stash_push', { path, message, includeUntracked })

export const stashPop = (path: string, index?: number) => invoke<void>('stash_pop', { path, index })

export const stashApply = (path: string, index?: number) =>
  invoke<void>('stash_apply', { path, index })

export const stashDrop = (path: string, index: number) => invoke<void>('stash_drop', { path, index })

// ─── Worktree ─────────────────────────────────────────────────────────────────

export const listWorktrees = (path: string) => invoke<GitWorktree[]>('list_worktrees', { path })

export const addWorktree = (path: string, branch: string, worktreePath: string) =>
  invoke<void>('add_worktree', { path, branch, worktreePath })

export const removeWorktree = (path: string, worktreePath: string, force = false) =>
  invoke<void>('remove_worktree', { path, worktreePath, force })

// ─── Rebase ───────────────────────────────────────────────────────────────────

export const getRebaseState = (path: string) => invoke<RebaseState>('get_rebase_state', { path })

export const startInteractiveRebase = (path: string, baseOid: string, steps: RebaseStep[]) =>
  invoke<void>('start_interactive_rebase', { path, baseOid, steps })

export const continueRebase = (path: string) => invoke<void>('continue_rebase', { path })

export const abortRebase = (path: string) => invoke<void>('abort_rebase', { path })

// ─── Ollama ───────────────────────────────────────────────────────────────────

export const checkOllamaStatus = (url: string) => invoke<OllamaStatus>('check_ollama_status', { url })

export const generateCommitMessage = (path: string, model: string, promptHint?: string) =>
  invoke<void>('generate_commit_message', { path, model, promptHint })

export const cancelGeneration = () => invoke<void>('cancel_generation')

// ─── Themes ───────────────────────────────────────────────────────────────────

export const getUserThemes = () => invoke<UserTheme[]>('get_user_themes')

// ─── Working Tree ─────────────────────────────────────────────────────────────

export const stageFile = (path: string, filePath: string) =>
  invoke<void>('stage_file', { path, filePath })

export const unstageFile = (path: string, filePath: string) =>
  invoke<void>('unstage_file', { path, filePath })

export const discardFileChanges = (path: string, filePath: string) =>
  invoke<void>('discard_file_changes', { path, filePath })


export const stageAll = (path: string) => invoke<void>('stage_all', { path })

export const unstageAll = (path: string) => invoke<void>('unstage_all', { path })

export const createCommit = (path: string, message: string, amend = false) =>
  invoke<string>('create_commit', { path, message, amend })

export const getStagedDiff = (path: string) => invoke<GitDiff>('get_staged_diff', { path })

export const getFileDiff = (path: string, filePath: string, staged: boolean) =>
  invoke<import('@git-manager/git-types').GitDiffFile>('get_file_diff', { path, filePath, staged })

// ─── Remote ───────────────────────────────────────────────────────────────────

export const fetchRemote = (path: string, remote?: string) =>
  invoke<{ remote: string; updatedRefs: string[] }>('fetch_remote', { path, remote })

export const pullBranch = (path: string, remote?: string, rebase?: boolean) =>
  invoke<{ fastForwarded: boolean; commitsMerged: number; conflicts: string[] }>(
    'pull_branch',
    { path, remote, rebase },
  )

export const pushBranch = (path: string, remote?: string, force?: boolean) =>
  invoke<void>('push_branch', { path, remote, force })

// ─── Settings ─────────────────────────────────────────────────────────────────

export const getSettings = () => invoke<AppSettings>('get_settings')

export const updateSettings = (settings: Partial<AppSettings>) =>
  invoke<void>('update_settings', { settings })

// ─── Rollback ─────────────────────────────────────────────────────────────────

export interface CommitSummary {
  oid: string
  shortOid: string
  subject: string
  authorName: string
  timestamp: number
}

export const revertCommit = (path: string, oid: string, noCommit = false) =>
  invoke<string>('revert_commit', { path, oid, noCommit })

export const resetToCommit = (path: string, oid: string, mode: 'soft' | 'mixed' | 'hard') =>
  invoke<void>('reset_to_commit', { path, oid, mode })

export const getCommitsBetween = (path: string, fromOid: string, toOid: string) =>
  invoke<CommitSummary[]>('get_commits_between', { path, fromOid, toOid })

// ─── Fixup ────────────────────────────────────────────────────────────────────

export interface FixupInfo {
  fixupOid: string
  fixupShortOid: string
  targetOid: string
  targetSubject: string
}

export interface AutosquashGroup {
  baseOid: string
  baseSubject: string
  fixups: string[]
}

export const createFixupCommit = (path: string, targetOid: string) =>
  invoke<string>('create_fixup_commit', { path, targetOid })

export const getPendingFixups = (path: string) =>
  invoke<FixupInfo[]>('get_pending_fixups', { path })

export const autosquashPreview = (path: string) =>
  invoke<AutosquashGroup[]>('autosquash_preview', { path })

export const runAutosquash = (path: string) =>
  invoke<void>('run_autosquash', { path })

// ─── Submodules ───────────────────────────────────────────────────────────────

export const listSubmodules = (path: string) =>
  invoke<GitSubmodule[]>('list_submodules', { path })
