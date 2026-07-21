import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { useDebugLogStore } from '../stores/debugLog.store'
import { redactArgs } from './debugLogRedact'
import type {
  GitRepo,
  GitStatus,
  GitGraphNode,
  GitBranch,
  GitRef,
  GitDiff,
  GitStash,
  GitWorktree,
  WorktreeAddResult,
  WorktreeAgentActivity,
  GitSubmodule,
  RebaseState,
  RebaseTodoStep,
  GitCommit,
  ThreeWayMergeView,
  AppSettings,
  UserTheme,
  GitRepoSummary,
  BlameHunk,
  FileHistoryEntry,
  PrTemplateDetection,
  ProjectCommand,
} from '@git-manager/git-types'
import type {
  AiProviderStatus,
  AiCheckConfig,
  AiGenerateConfig,
  AiContext,
  AiContextScope,
  AiActivity,
  JsonSchema,
} from '@git-manager/ai'

/**
 * Single chokepoint for every frontend→backend call. Wraps Tauri's `invoke` so the debug log
 * (`stores/debugLog.store.ts`, surfaced in Settings → Debug) can record the command name,
 * redacted arguments, duration and success/error of each IPC round-trip — capturing 100% of what
 * the app asks the backend to do (git2 and shell-outs alike), which is otherwise invisible from
 * outside the native window. Transparent when logging is disabled (the default): just a passthrough.
 */
async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const start = performance.now()
  try {
    // Preserve the exact call shape (no trailing `undefined`) so no-arg commands still forward as
    // `invoke('cmd')` rather than `invoke('cmd', undefined)`.
    const result =
      args === undefined ? await tauriInvoke<T>(command) : await tauriInvoke<T>(command, args)
    record(command, args, start, 'ok')
    return result
  } catch (err) {
    record(command, args, start, 'error', String(err))
    throw err
  }
}

function record(
  command: string,
  args: Record<string, unknown> | undefined,
  start: number,
  status: 'ok' | 'error',
  error?: string
) {
  const store = useDebugLogStore.getState()
  if (!store.enabled) return
  store.add({
    command,
    args: redactArgs(command, args),
    durationMs: Math.round(performance.now() - start),
    status,
    error,
  })
}

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
  opts?: {
    limit?: number
    skip?: number
    branch?: string
    author?: string
    showStashes?: boolean
    hiddenStashes?: string[]
    /** Whether a synthetic WIP / paused-rebase row will be rendered above the graph — an input
     * of the Rust column layout (seeds HEAD's lane at column 0 only when that row exists). */
    headHasWip?: boolean
  }
) => invoke<GitGraphNode[]>('get_log', { path, ...opts })

export const getCommitDiff = (path: string, oid: string) =>
  invoke<GitDiff>('get_commit_diff', { path, oid })

/** Merged diff across a multi-commit selection: `baseOid^..headOid` (see the Rust command). */
export const getCommitsMergedDiff = (path: string, baseOid: string, headOid: string) =>
  invoke<GitDiff>('get_commits_merged_diff', { path, baseOid, headOid })

export const compareCommitToWorkdir = (path: string, oid: string) =>
  invoke<GitDiff>('compare_commit_to_workdir', { path, oid })

export const getCommitFile = (path: string, oid: string, filePath: string) =>
  invoke<string>('get_commit_file', { path, oid, filePath })

// ─── Blame / File history ───────────────────────────────────────────────────────

export const gitBlameFile = (path: string, filePath: string, oid?: string) =>
  invoke<BlameHunk[]>('git_blame_file', { path, filePath, oid })

export const getFileHistory = (path: string, filePath: string, limit?: number) =>
  invoke<FileHistoryEntry[]>('get_file_history', { path, filePath, limit })

/** Short name of the earliest tag whose history contains `oid`, or null. */
export const getTagContainingCommit = (path: string, oid: string) =>
  invoke<string | null>('get_tag_containing_commit', { path, oid })

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

export const mergeBranch = (path: string, source: string, target: string) =>
  invoke<void>('merge_branch', { path, source, target })

export const fastForwardBranch = (path: string, source: string, target: string) =>
  invoke<void>('fast_forward_branch', { path, source, target })

export const renameBranch = (path: string, oldName: string, newName: string) =>
  invoke<void>('rename_branch', { path, oldName, newName })

export const recreateBranchRef = (path: string, name: string, oid: string, upstream?: string) =>
  invoke<void>('recreate_branch_ref', { path, name, oid, upstream })

export const createTag = (path: string, name: string, fromRef: string, message?: string) =>
  invoke<void>('create_tag', { path, name, fromRef, message })

export const deleteTag = (path: string, name: string) => invoke<void>('delete_tag', { path, name })

// ─── Stash ────────────────────────────────────────────────────────────────────

export const stashList = (path: string) => invoke<GitStash[]>('stash_list', { path })

export const stashPush = (path: string, message?: string, includeUntracked = false) =>
  invoke<void>('stash_push', { path, message, includeUntracked })

export const stashPop = (path: string, index?: number) => invoke<void>('stash_pop', { path, index })

export const stashApply = (path: string, index?: number) =>
  invoke<void>('stash_apply', { path, index })

export const stashDrop = (path: string, index: number) =>
  invoke<void>('stash_drop', { path, index })

export const stashStore = (path: string, commitOid: string, message: string) =>
  invoke<void>('stash_store', { path, commitOid, message })

export const editStashMessage = (path: string, index: number, message: string) =>
  invoke<void>('edit_stash_message', { path, index, message })

// ─── Worktree ─────────────────────────────────────────────────────────────────

export const listWorktrees = (path: string) => invoke<GitWorktree[]>('list_worktrees', { path })

export const addWorktree = (
  path: string,
  branch: string,
  worktreePath: string,
  defaultFiles?: string[]
) => invoke<WorktreeAddResult>('add_worktree', { path, branch, worktreePath, defaultFiles })

/** Per-pattern count (aligned by index) of repo files each default-file glob matches — a live
 * preview for the worktree-creation UI. */
export const countDefaultFileMatches = (path: string, patterns: string[]) =>
  invoke<number[]>('count_default_file_matches', { path, patterns })

export const removeWorktree = (path: string, worktreePath: string, force = false) =>
  invoke<void>('remove_worktree', { path, worktreePath, force })

export const pruneWorktrees = (path: string) => invoke<void>('prune_worktrees', { path })

/** Local branch names whose upstream remote branch is gone (merged & pruned) — bulk-removal signal. */
export const goneUpstreamBranches = (path: string) =>
  invoke<string[]>('gone_upstream_branches', { path })

/** For each given worktree path, whether an AI coding agent (Claude Code) is currently working in
 * it — derived from the agent's on-disk session logs. Only worktrees with a recent session are
 * returned. */
export const getWorktreeAgentActivity = (paths: string[]) =>
  invoke<WorktreeAgentActivity[]>('get_worktree_agent_activity', { paths })

// ─── Rebase ───────────────────────────────────────────────────────────────────

export const getRebaseState = (path: string) => invoke<RebaseState>('get_rebase_state', { path })

/** Commits from `baseOid` (inclusive) up to HEAD, oldest first. */
export const listRebaseCommits = (path: string, baseOid: string) =>
  invoke<GitCommit[]>('list_rebase_commits', { path, baseOid })

/** Runs `git rebase -i` with the UI-built todo list. A conflict pause is not an error. */
export const runInteractiveRebase = (path: string, baseOid: string, steps: RebaseTodoStep[]) =>
  invoke<void>('run_interactive_rebase', { path, baseOid, steps })

export const continueRebase = (path: string, message?: string) =>
  invoke<void>('continue_rebase', { path, message })

export const abortRebase = (path: string) => invoke<void>('abort_rebase', { path })

export const skipRebase = (path: string) => invoke<void>('skip_rebase', { path })

export const rebaseOntoCommit = (path: string, targetOid: string) =>
  invoke<void>('rebase_onto_commit', { path, targetOid })

// ─── Conflict Resolution ──────────────────────────────────────────────────────

export const listConflictedFiles = (path: string) =>
  invoke<string[]>('list_conflicted_files', { path })

export const getMergeView = (path: string, filePath: string) =>
  invoke<ThreeWayMergeView>('get_merge_view', { path, filePath })

export const autoMergeConflictView = (path: string, filePath: string) =>
  invoke<string>('auto_merge_conflict_view', { path, filePath })

export const resolveConflict = (path: string, filePath: string, resolvedContent: string) =>
  invoke<void>('resolve_conflict', { path, filePath, resolvedContent })

export const resolveConflictBinary = (path: string, filePath: string, side: 'ours' | 'theirs') =>
  invoke<void>('resolve_conflict_binary', { path, filePath, side })

// ─── AI ───────────────────────────────────────────────────────────────────────

export const checkAiStatus = (config: AiCheckConfig) =>
  invoke<AiProviderStatus>('check_ai_status', { config })

export const getAiContext = (path: string, scope: AiContextScope, baseRef?: string) =>
  invoke<AiContext>('get_ai_context', { path, scope, baseRef: baseRef ?? null })

export const getAiActivity = (path: string, sinceHours: number) =>
  invoke<AiActivity>('get_ai_activity', { path, sinceHours })

export const aiGenerateStream = (
  config: AiGenerateConfig,
  systemPrompt: string,
  userPrompt: string
) => invoke<void>('ai_generate_stream', { config, systemPrompt, userPrompt })

export const aiComplete = (
  config: AiGenerateConfig,
  systemPrompt: string,
  userPrompt: string,
  schema?: JsonSchema
) => invoke<string>('ai_complete', { config, systemPrompt, userPrompt, schema })

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

/** Whether `oid` is HEAD or one of its ancestors (i.e. on the current branch). */
export const isCommitOnCurrentBranch = (path: string, oid: string) =>
  invoke<boolean>('is_commit_on_current_branch', { path, oid })

// ─── Remote ───────────────────────────────────────────────────────────────────

export const fetchRemote = (path: string, remote?: string, prune?: boolean) =>
  invoke<{ remote: string; updatedRefs: string[] }>('fetch_remote', { path, remote, prune })

export const pullBranch = (path: string, remote?: string, rebase?: boolean) =>
  invoke<{ fastForwarded: boolean; commitsMerged: number; conflicts: string[] }>('pull_branch', {
    path,
    remote,
    rebase,
  })

export const pushBranch = (path: string, remote?: string, force?: boolean) =>
  invoke<void>('push_branch', { path, remote, force })

export const pushBranchTo = (
  path: string,
  source: string,
  target: string,
  remote?: string,
  force?: boolean
) => invoke<void>('push_branch_to', { path, remote, source, target, force })

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

export const getCommitWebUrl = (path: string, oid: string, remote?: string) =>
  invoke<string | null>('get_commit_web_url', { path, oid, remote })

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

// ─── Cherry-pick ──────────────────────────────────────────────────────────────

export const cherryPickCommit = (path: string, oid: string) =>
  invoke<string>('cherry_pick_commit', { path, oid })

// ─── Patch ────────────────────────────────────────────────────────────────────

export const createPatch = (path: string, oid: string, destPath: string) =>
  invoke<void>('create_patch', { path, oid, destPath })

export const createWorkingPatch = (path: string, filePaths: string[], destPath: string) =>
  invoke<void>('create_working_patch', { path, filePaths, destPath })

export const previewWorkingPatch = (path: string, filePaths: string[]) =>
  invoke<string>('preview_working_patch', { path, filePaths })

export const readPatchFile = (patchPath: string) =>
  invoke<string>('read_patch_file', { patchPath })

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

export const createFixupCommit = (path: string, targetOid: string, message?: string) =>
  invoke<CommitResult>('create_fixup_commit', { path, targetOid, message })

export interface FixupRiskCommit {
  oid: string
  shortOid: string
  subject: string
}

export interface FixupFileRisk {
  path: string
  commits: FixupRiskCommit[]
}

export interface FixupTargetWarnings {
  missingInTarget: string[]
  touchedAfterTarget: FixupFileRisk[]
}

export const checkFixupTarget = (path: string, targetOid: string) =>
  invoke<FixupTargetWarnings>('check_fixup_target', { path, targetOid })

export const getPendingFixups = (path: string) =>
  invoke<FixupInfo[]>('get_pending_fixups', { path })

export const autosquashPreview = (path: string) =>
  invoke<AutosquashGroup[]>('autosquash_preview', { path })

export const runAutosquash = (path: string) => invoke<void>('run_autosquash', { path })

// ─── Submodules ───────────────────────────────────────────────────────────────

export const listSubmodules = (path: string) => invoke<GitSubmodule[]>('list_submodules', { path })

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

export const githubGetUser = (token: string) => invoke<GitHubUserInfo>('github_get_user', { token })

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

/** Resolves `sha → avatar URL` for the given commit SHAs; unresolved SHAs are simply absent. */
export const githubCommitAvatars = (
  token: string,
  owner: string,
  repo: string,
  shas: string[]
) => invoke<Record<string, string>>('github_commit_avatars', { token, owner, repo, shas })

/** Detects the repo's GitHub PR template(s) on disk (single file, multi-template dir, or none). */
export const getPrTemplate = (path: string) =>
  invoke<PrTemplateDetection>('get_pr_template', { path })

// ─── Extended Repo Stats & Tools ─────────────────────────────────────────────

export const getRepoSummary = (path: string) => invoke<GitRepoSummary>('get_repo_summary', { path })

export const openInEditor = (path: string, command: string) =>
  invoke<void>('open_in_editor', { path, command })

export const getRepoReadme = (path: string) => invoke<string>('get_repo_readme', { path })

export const getTerminalCommands = () => invoke<string[]>('get_terminal_commands')

/** Runs a project task's `command` in the configured external terminal (`terminalCommand`, empty →
 * system default), with `path` (the repo) as the working directory. */
export const runTaskInTerminal = (path: string, command: string, terminalCommand: string) =>
  invoke<void>('run_task_in_terminal', { path, command, terminalCommand })

/** Lists runnable commands declared by the project at `path` (today: package.json scripts). */
export const getProjectCommands = (path: string) =>
  invoke<ProjectCommand[]>('get_project_commands', { path })

// ─── SSH ─────────────────────────────────────────────────────────────────────

export const generateSshKey = (
  keyType: string,
  bits: number | null,
  comment: string,
  path: string,
  passphrase?: string
) => invoke<string>('generate_ssh_key', { keyType, bits, comment, path, passphrase })

export const readSshPublicKey = (path: string) => invoke<string>('read_ssh_public_key', { path })
