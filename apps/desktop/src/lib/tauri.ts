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
  GitRepoSummary,
} from '@git-manager/git-types'

// ─── Repository ───────────────────────────────────────────────────────────────

export const openRepo = (path: string) => invoke<GitRepo>('open_repo', { path })

export const getRepoStatus = (path: string) => invoke<GitStatus>('get_repo_status', { path })

export const scanRepos = (rootPath: string, maxDepth: number) =>
  invoke<string[]>('scan_repos', { rootPath, maxDepth })

export const cloneRepo = (url: string, destPath: string, shallow?: boolean, sparse?: boolean) =>
  invoke<GitRepo>('clone_repo', { url, destPath, shallow, sparse })

export const initRepo = (path: string) => invoke<GitRepo>('init_repo', { path })

// ─── Log / Graph ──────────────────────────────────────────────────────────────

export const getLog = (
  path: string,
  opts?: { limit?: number; skip?: number; branch?: string; author?: string; showStashes?: boolean; hiddenStashes?: string[] }
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

export const checkoutBranch = (path: string, refName: string, force = false) =>
  invoke<void>('checkout_branch', { path, refName, force })

export const deleteBranch = (path: string, name: string, force = false, deleteRemote = false) =>
  invoke<void>('delete_branch', { path, name, force, deleteRemote })

export const renameBranch = (path: string, oldName: string, newName: string) =>
  invoke<void>('rename_branch', { path, oldName, newName })

export const recreateBranchRef = (path: string, name: string, oid: string, upstream?: string) =>
  invoke<void>('recreate_branch_ref', { path, name, oid, upstream })

// ─── Stash ────────────────────────────────────────────────────────────────────

export const stashList = (path: string) => invoke<GitStash[]>('stash_list', { path })

export const stashPush = (path: string, message?: string, includeUntracked = false) =>
  invoke<void>('stash_push', { path, message, includeUntracked })

export const stashPop = (path: string, index?: number) => invoke<void>('stash_pop', { path, index })

export const stashApply = (path: string, index?: number) =>
  invoke<void>('stash_apply', { path, index })

export const stashDrop = (path: string, index: number) => invoke<void>('stash_drop', { path, index })

export const stashStore = (path: string, commitOid: string, message: string) =>
  invoke<void>('stash_store', { path, commitOid, message })

export const editStashMessage = (path: string, index: number, message: string) =>
  invoke<void>('edit_stash_message', { path, index, message })


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

export const createCommit = (path: string, message: string, amend = false, amendOid?: string) =>
  invoke<CommitResult>('create_commit', { path, message, amend, amendOid })

export const getStagedDiff = (path: string) => invoke<GitDiff>('get_staged_diff', { path })

export const getFileDiff = (path: string, filePath: string, staged: boolean, oid?: string) =>
  invoke<import('@git-manager/git-types').GitDiffFile>('get_file_diff', { path, filePath, staged, oid })

export interface RawFileDiffContents {
  original: string
  modified: string
}

export const getFileRawContents = (path: string, filePath: string, staged: boolean, oid?: string) =>
  invoke<RawFileDiffContents>('get_file_raw_contents', { path, filePath, staged, oid })

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

export interface RemoteInfo {
  name: string
  url: string
  pushUrl?: string
}

export const getRemotes = (path: string) => invoke<RemoteInfo[]>('get_remotes', { path })

export const addRemote = (path: string, name: string, url: string) =>
  invoke<void>('add_remote', { path, name, url })

export const removeRemote = (path: string, name: string) =>
  invoke<void>('remove_remote', { path, name })

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

export const unpinObject = (path: string, refName: string) =>
  invoke<void>('unpin_object', { path, refName })

export const objectsExist = (path: string, oids: string[]) =>
  invoke<boolean[]>('objects_exist', { path, oids })

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

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface PollTokenResponse {
  access_token: string | null
  error: string | null
  error_description: string | null
}

export interface GitHubUserInfo {
  login: string
  name: string | null
  email: string | null
  avatarUrl: string
}

export const githubDeviceCode = (scope: string) =>
  invoke<DeviceCodeResponse>('github_device_code', { scope })

export const githubPollToken = (deviceCode: string) =>
  invoke<PollTokenResponse>('github_poll_token', { deviceCode })

export const githubGetUser = (token: string) =>
  invoke<GitHubUserInfo>('github_get_user', { token })

export interface GitHubRepoInfo {
  id: number
  name: string
  fullName: string
  private: boolean
  htmlUrl: string
  description: string | null
  updatedAt: string
}

export const githubListRepos = (token: string) =>
  invoke<GitHubRepoInfo[]>('github_list_repos', { token })

// ─── Extended Repo Stats & Tools ─────────────────────────────────────────────

export const getRepoSummary = (path: string) =>
  invoke<GitRepoSummary>('get_repo_summary', { path })

export const openInEditor = (path: string, editor: string, customCommand?: string) =>
  invoke<void>('open_in_editor', { path, editor, customCommand })

export const getRepoReadme = (path: string) =>
  invoke<string>('get_repo_readme', { path })

export const getTerminalCommands = () =>
  invoke<string[]>('get_terminal_commands')

// ─── SSH ─────────────────────────────────────────────────────────────────────

export const generateSshKey = (
  keyType: string,
  bits: number | null,
  comment: string,
  path: string,
  passphrase?: string
) => invoke<string>('generate_ssh_key', { keyType, bits, comment, path, passphrase })

export const readSshPublicKey = (path: string) =>
  invoke<string>('read_ssh_public_key', { path })
