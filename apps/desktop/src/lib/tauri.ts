import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { useActivityLogStore } from '../stores/activityLog.store'
import { getActiveCorrelation, getActiveSession } from './activityCorrelation'
import { persistActivityEntry } from './activityLogPersistence'
import { redactArgs } from './debugLogRedact'
import type {
  GitRepo,
  GitStatus,
  GitGraphNode,
  GitLogHeadOverride,
  GitBranch,
  MergeTargetStatus,
  GitRef,
  GitDiff,
  GitStash,
  GitWorktree,
  WorktreeAddResult,
  WorktreeAgentActivity,
  GitSubmodule,
  RebaseState,
  RebaseTodoStep,
  BisectState,
  BisectTerm,
  GitCommit,
  ThreeWayMergeView,
  UserTheme,
  GitRepoSummary,
  BlameHunk,
  FileHistoryEntry,
  PrTemplateDetection,
  ProjectCommand,
  TerminalHistorySource,
  StoredSummaryFile,
  Board,
  BoardColumn,
  BoardCard,
  BoardCardPatch,
  NewBoardCard,
  BoardTag,
  BoardWithCards,
  SprintSummary,
} from '@git-manager/git-types'
import type {
  AiProviderStatus,
  AiCheckConfig,
  AiGenerateConfig,
  AiContext,
  AiContextScope,
  AiActivity,
  AiCommitScan,
  JsonSchema,
} from '@git-manager/ai'

/**
 * Single chokepoint for every frontend→backend call. Wraps Tauri's `invoke` so the activity log
 * (`stores/activityLog.store.ts`, surfaced in the footer's Activity Logs view) can record the
 * command name, redacted arguments, duration, targeted repository and success/error of each IPC
 * round-trip — capturing 100% of what the app asks the backend to do (git2 and shell-outs alike),
 * which is otherwise invisible from outside the native window. Calls made inside a `runActivity`
 * block (`lib/activityCorrelation.ts`) are additionally tagged so they group into one action.
 * Capture is always on — there is no disable switch.
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
    const rawMessage = String(err)
    record(command, args, start, 'error', rawMessage)
    throw toReadableError(err, rawMessage)
  }
}

/**
 * Every Tauri command rejects with `AppError`'s JSON serialization (`{ code, message, detail }`,
 * see `error.rs`), not a plain `Error` — so `String(err)` on it is the raw blob, e.g.
 * `{"code":"GIT_ERROR","message":"...","detail":null}`. Unwrapped once here so every call site's
 * `toast.error(String(err))` shows just the `message` field for free (`String()` on a real `Error`
 * returns its `.message` via `Error.prototype.toString`). A rejection that isn't that JSON shape —
 * e.g. a plain JS `Error` thrown before the IPC call ever reached the backend — passes through
 * unchanged.
 */
function toReadableError(err: unknown, rawMessage: string): unknown {
  try {
    const parsed = JSON.parse(rawMessage)
    if (parsed && typeof parsed.message === 'string') {
      const error = new Error(parsed.message) as AppErrorLike
      // `code` and `detail` used to be dropped here, which made them unreachable from any call
      // site — the payload was flattened to its `message` and the rest thrown away. That was
      // invisible until something needed the long version: a failed hook's own output, which *is*
      // the error as far as the user is concerned ("pre-commit failed" says nothing; the three
      // lines it printed say everything).
      if (typeof parsed.code === 'string') error.code = parsed.code
      if (typeof parsed.detail === 'string') error.detail = parsed.detail
      return error
    }
  } catch {
    // Not JSON: not an AppError payload, nothing to unwrap.
  }
  return err
}

/** An `Error` carrying the rest of an `AppError` payload. See `toReadableError`. */
export interface AppErrorLike extends Error {
  /** The `AppError` variant's stable code, e.g. `HOOK_FAILED`. */
  code?: string
  /** The long form, when the variant has one. Newline-separated. */
  detail?: string
}

function record(
  command: string,
  args: Record<string, unknown> | undefined,
  start: number,
  status: 'ok' | 'error',
  error?: string
) {
  const store = useActivityLogStore.getState()
  const repoPath = repoPathOf(args)
  // A multi-step operation running in this repository wins over the per-action correlation, because
  // it is the larger truth: the `git.rebaseInteractive` action that *starts* a rebase, and the
  // `git add` that settles a conflict three minutes later, are both the same rebase. See
  // `activityCorrelation.ts` — only the operations on that module's allowlist are captured this way,
  // so an unrelated push during a paused rebase keeps its own identity.
  const correlation = getActiveSession(repoPath, command) ?? getActiveCorrelation()
  store.add({
    command,
    args: redactArgs(command, args),
    durationMs: Math.round(performance.now() - start),
    status,
    error,
    repoPath,
    correlationId: correlation?.id,
    correlationLabel: correlation?.label,
  })
  // Stream the entry just stored (now carrying its generated id + timestamp) to the rotating
  // on-disk log. Best-effort and fire-and-forget — see `activityLogPersistence.ts`.
  persistActivityEntry(useActivityLogStore.getState().entries[0])
}

/**
 * Records a synthetic Activity Logs entry for an operation that does NOT go through `invoke` — e.g.
 * the Tauri updater/process/app plugins, which the frontend calls directly (see `updater.api.ts`).
 * Without this those calls (and their failures) would be invisible in the journal. `durationMs`
 * defaults to 0 for instantaneous operations.
 */
export function recordActivity(
  command: string,
  status: 'ok' | 'error',
  options: { durationMs?: number; error?: string } = {}
) {
  const correlation = getActiveCorrelation()
  useActivityLogStore.getState().add({
    command,
    durationMs: options.durationMs ?? 0,
    status,
    error: options.error,
    correlationId: correlation?.id,
    correlationLabel: correlation?.label,
  })
  persistActivityEntry(useActivityLogStore.getState().entries[0])
}

/**
 * The repository an IPC call targets, read from the conventional `path`/`repoPath` argument (never
 * sensitive). Lets the Activity Logs view scope down to the active repository's operations.
 */
function repoPathOf(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined
  const candidate = args.path ?? args.repoPath
  return typeof candidate === 'string' ? candidate : undefined
}

// ─── Activity log ─────────────────────────────────────────────────────────────

/** Reveals the on-disk activity-logs directory in the Finder (creating it if needed). */
export const openActivityLogsDir = () => invoke<void>('open_activity_logs_dir')

/** Reveals the AI transcript directory (`~/.git-manager/ai-logs/`) in the Finder. */
export const openAiLogsDir = () => invoke<void>('open_ai_logs_dir')

// Reading the log back is deliberately NOT wrapped here — see `readPersistedActivityLog` in
// `lib/activityLogPersistence.ts`, which owns both halves of the raw-invoke exception.

// ─── Repository ───────────────────────────────────────────────────────────────

export const openRepo = (path: string) => invoke<GitRepo>('open_repo', { path })

export const getRepoStatus = (path: string) => invoke<GitStatus>('get_repo_status', { path })

/** The multi-step git operation in progress (`merge`, `rebase`, `cherry_pick`, `revert`, `bisect`,
 * `apply_mailbox`), or `null` when there is none. */
export const getPendingOperation = (path: string) =>
  invoke<string | null>('get_pending_operation', { path })

export const scanRepos = (rootPath: string, maxDepth: number) =>
  invoke<string[]>('scan_repos', { rootPath, maxDepth })

/** Tracked file paths of the repo (`git ls-files`), sorted and de-duplicated. */
export const listTrackedFiles = (path: string) => invoke<string[]>('list_tracked_files', { path })

/** All repository files (tracked and untracked, excluding gitignored). */
export const getRepoFiles = (path: string) => invoke<string[]>('get_repo_files', { path })

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
    /** Solo mode: branch shortNames to isolate — the graph loads only commits reachable from these
     * (Tauri camelCase → `solo_branches`). Takes precedence over the single-branch `branch` filter. */
    soloBranches?: string[]
    author?: string
    showStashes?: boolean
    hiddenStashes?: string[]
    /** Whether a synthetic WIP / paused-rebase row will be rendered above the graph — an input
     * of the Rust column layout (seeds HEAD's lane at column 0 only when that row exists). */
    headHasWip?: boolean
    /** Build the graph as if a branch pointed elsewhere — the timeline preview. Read-only. */
    headOverride?: GitLogHeadOverride
  }
) => invoke<GitGraphNode[]>('get_log', { path, ...opts })

/** A commit vs. one of its parents. `parentIndex` is 0-based and defaults to the first parent —
 *  only a merge commit has another (see the Rust `git_diff::commit_diff`). */
export const getCommitDiff = (path: string, oid: string, parentIndex?: number) =>
  invoke<GitDiff>('get_commit_diff', { path, oid, parentIndex })

/** Merged diff across a multi-commit selection: `baseOid^..headOid` (see the Rust command). */
export const getCommitsMergedDiff = (path: string, baseOid: string, headOid: string) =>
  invoke<GitDiff>('get_commits_merged_diff', { path, baseOid, headOid })

export const compareCommitToWorkdir = (path: string, oid: string) =>
  invoke<GitDiff>('compare_commit_to_workdir', { path, oid })

/** Direct (two-dot) diff between two refs — `git diff <baseRef> <headRef>`. Either side can be a
 *  branch, a remote branch, a tag or a SHA (see the Rust `compare_refs` command). */
export const compareRefs = (path: string, baseRef: string, headRef: string) =>
  invoke<GitDiff>('compare_refs', { path, baseRef, headRef })

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

/** Deletes branch `branchName` on `remote` (default "origin") — `git push origin :refs/heads/<name>`. */
export const deleteRemoteBranch = (path: string, branchName: string, remote?: string) =>
  invoke<void>('delete_remote_branch', { path, branchName, remote })

export const mergeBranch = (path: string, source: string, target: string) =>
  invoke<void>('merge_branch', { path, source, target })

export const fastForwardBranch = (path: string, source: string, target: string) =>
  invoke<void>('fast_forward_branch', { path, source, target })

/** Sets local branch `name`'s upstream to `upstream` (a remote-tracking branch's short name, e.g.
 * `origin/main`) — `git branch --set-upstream-to`. */
export const setBranchUpstream = (path: string, name: string, upstream: string) =>
  invoke<void>('set_branch_upstream', { path, name, upstream })

/** Relation between HEAD and the first of `candidates` that exists in the repo (merge simulated
 * in memory — nothing is written to the repository). */
export const getMergeTargetStatus = (path: string, candidates: string[]) =>
  invoke<MergeTargetStatus>('get_merge_target_status', { path, candidates })

export const renameBranch = (path: string, oldName: string, newName: string) =>
  invoke<void>('rename_branch', { path, oldName, newName })

export const recreateBranchRef = (path: string, name: string, oid: string, upstream?: string) =>
  invoke<void>('recreate_branch_ref', { path, name, oid, upstream })

export const createTag = (path: string, name: string, fromRef: string, message?: string) =>
  invoke<void>('create_tag', { path, name, fromRef, message })

export const deleteTag = (path: string, name: string) => invoke<void>('delete_tag', { path, name })

/** Deletes tag `tagName` on `remote` (default "origin") — `git push origin :refs/tags/<name>`. */
export const deleteRemoteTag = (path: string, tagName: string, remote?: string) =>
  invoke<void>('delete_remote_tag', { path, tagName, remote })

/** Publishes a tag to `remote` (default "origin") — `git push origin <name>`. */
export const pushTag = (path: string, tagName: string, remote?: string) =>
  invoke<void>('push_tag', { path, tagName, remote })

/** Tag's GitHub release page URL on `remote` (default "origin"), or null if not a GitHub remote. */
export const getTagWebUrl = (path: string, tagName: string, remote?: string) =>
  invoke<string | null>('get_tag_web_url', { path, tagName, remote })

/** Branch's GitHub tree page URL on `remote` (default "origin"), or null if not a GitHub remote. */
export const getBranchWebUrl = (path: string, branchName: string, remote?: string) =>
  invoke<string | null>('get_branch_web_url', { path, branchName, remote })

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

// ─── Bisect ─────────────────────────────────────────────────────────────────

export const getBisectState = (path: string) => invoke<BisectState>('get_bisect_state', { path })

/** Whether `goodRev` is an ancestor of `badRev` — the only valid bisect orientation. */
export const bisectCheckRange = (path: string, badRev: string, goodRev: string) =>
  invoke<boolean>('bisect_check_range', { path, badRev, goodRev })

/** Starts a bisect session, marking `badRev` bad and `goodRev` good in one shot. */
export const bisectStart = (path: string, badRev: string, goodRev: string) =>
  invoke<BisectState>('bisect_start', { path, badRev, goodRev })

/** Marks the commit currently under test as good/bad/skip and advances. */
export const bisectMark = (path: string, term: BisectTerm) =>
  invoke<BisectState>('bisect_mark', { path, term })

/** Ends the bisect session, restoring the original branch/HEAD. */
export const bisectReset = (path: string) => invoke<BisectState>('bisect_reset', { path })

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

/** Asks the provider what a model's context window really is. Ollama-only; every field comes back
 * unset when the provider has nothing to say, which is a normal answer rather than a failure. */
/** Mirrors the Rust `ModelContextLimits` serde struct. */
export interface ModelContextLimits {
  /** The model architecture's own maximum, in tokens — a hard ceiling. */
  architectureMax: number | null
  /** `num_ctx` pinned in the model's Modelfile, when it pins one. */
  modelfileNumCtx: number | null
  /** The window the server actually allocated for this model, in tokens — only reported while the
   * model is loaded, and the only one of the three that reflects a server-side
   * `OLLAMA_CONTEXT_LENGTH`. */
  allocatedContext: number | null
  /** `max_model_len` from the OpenAI-compatible `/v1/models` entry. Non-standard, so usually null;
   * omlx reports it, which is what lets a user there stop guessing at the window. */
  servedMaxModelLen: number | null
}

export const getModelContextLimits = (url: string, model: string, apiKey?: string) =>
  invoke<ModelContextLimits>('get_model_context_limits', { url, model, apiKey })

export const getAiContext = (
  path: string,
  scope: AiContextScope,
  baseRef?: string,
  // `range` scope only: the branch/ref the range ends at. Defaults to HEAD on the backend, so
  // explaining a branch that isn't checked out is the only caller that passes it.
  headRef?: string
) =>
  invoke<AiContext>('get_ai_context', {
    path,
    scope,
    baseRef: baseRef ?? null,
    headRef: headRef ?? null,
  })

/** `sinceEpoch`/`untilEpoch` bound one local calendar day in epoch seconds; `candidates` is the
 * ordered main-branch list (`origin/main`, `origin/master`, …), so the window is taken over that
 * branch and not over whatever is checked out. */
export const getAiActivity = (
  path: string,
  sinceEpoch: number,
  untilEpoch: number,
  candidates: string[]
) => invoke<AiActivity>('get_ai_activity', { path, sinceEpoch, untilEpoch, candidates })

/** Writes one morning's briefing to the markdown archive, returning the path written. */
export const saveDailySummary = (
  repoPath: string,
  date: string,
  markdown: string,
  alsoInRepo: boolean
) => invoke<string>('save_daily_summary', { repoPath, date, markdown, alsoInRepo })

/** Reads the whole archive — every repository, every retained day — newest first. */
export const listDailySummaries = () => invoke<StoredSummaryFile[]>('list_daily_summaries')

export const deleteDailySummary = (filePath: string) =>
  invoke<void>('delete_daily_summary', { filePath })

/** Reveals the archive directory (`~/.git-manager/summaries/`) in the Finder. */
export const openDailySummariesDir = () => invoke<void>('open_daily_summaries_dir')

/** The commits an AI search will read, newest first, each with its full oid and touched paths.
 * `maxCommits` bounds the scan — every commit returned costs one model call. */
export const getAiCommitScan = (path: string, maxCommits?: number) =>
  invoke<AiCommitScan>('get_ai_commit_scan', {
    path,
    // The optional time bound the command still accepts is deliberately unused: it can only ever
    // return *fewer* commits than the count asked for, and the count is the one that must bind
    // because it is what the run costs. See `ai_commit_scan.rs`.
    sinceHours: null,
    maxCommits: maxCommits ?? null,
  })

/** `requestId` tags every `ai:*` event this generation emits, and is what {@link cancelGeneration}
 * targets. The events are window-wide broadcasts, so without it a second generation started while
 * the first streams receives the first's tokens. */
export const aiGenerateStream = (
  config: AiGenerateConfig,
  systemPrompt: string,
  userPrompt: string,
  requestId: string
) => invoke<void>('ai_generate_stream', { config, systemPrompt, userPrompt, requestId })

export const aiComplete = (
  config: AiGenerateConfig,
  systemPrompt: string,
  userPrompt: string,
  schema?: JsonSchema
) => invoke<string>('ai_complete', { config, systemPrompt, userPrompt, schema })

/** Cancels one generation by the id its caller minted. An id that has already finished is a no-op
 * on the Rust side — hitting stop as the last token lands is a normal race. */
export const cancelGeneration = (requestId: string) =>
  invoke<void>('cancel_generation', { requestId })

// ─── Configuration file (~/.git-manager/settings.json) ────────────────────────

/** Mirrors the Rust `AppConfigLoad`. `disabled` is `GIT_MANAGER_NO_CONFIG` — the app must then not
 * touch the file in either direction (the e2e suite runs this way). */
export interface AppConfigLoad {
  disabled: boolean
  /** The file verbatim, or `null` on a fresh install (and always when `disabled`). */
  contents: string | null
}

export const readAppConfig = () => invoke<AppConfigLoad>('read_app_config')

/** Replaces one section; a `null` value removes it. Per section rather than per file so a stale
 * second window can't roll back what another window changed — see `services/app_config.rs`. */
export const writeAppConfigSection = (section: string, version: number, value: unknown) =>
  invoke<void>('write_app_config_section', { section, version, value })

// ─── Themes ───────────────────────────────────────────────────────────────────

export const getUserThemes = () => invoke<UserTheme[]>('get_user_themes')

/** Native window material behind the webview (macOS); `'none'` clears it. */
export const setWindowVibrancy = (material: string, appearance: string) =>
  invoke<void>('set_window_vibrancy', { material, appearance })

/** Raises this window's native level above the macOS menu bar (notification popover, macOS only). */
export const raiseAboveMenuBar = () => invoke<void>('raise_above_menu_bar')

/** Clears the WKWebView's opaque backdrop so a `transparent` window really is (macOS only). */
export const clearWindowBackdrop = () => invoke<void>('clear_window_backdrop')

/**
 * The real per-machine notch/camera-housing geometry, read from `NSScreen` — `null` off macOS, or
 * if AppKit unexpectedly reports no screens at all. Mirrors the Rust `NotchMetrics`.
 */
export interface NotchMetrics {
  /** `NSScreen.safeAreaInsets.top`, in points. `0` on a display with no camera housing. */
  safeAreaTop: number
  /** Half the width of the reserved area the housing occupies. `0` when there is no housing. */
  housingHalfWidth: number
}

export const getNotchMetrics = () => invoke<NotchMetrics | null>('get_notch_metrics')

// ─── Native notifications ─────────────────────────────────────────────────────

/**
 * One OS notification. `route` is opaque to Rust: it is handed back verbatim on the
 * `notification://activated` event when the user clicks the banner (see
 * `commands/notification.rs` and `api/notification.api.ts`).
 */
export interface NativeNotificationRequest {
  title: string
  body: string
  /** macOS system sound name; omit for a silent notification. */
  sound?: string
  route: unknown
}

export const sendNativeNotification = (request: NativeNotificationRequest) =>
  invoke<void>('send_native_notification', { request })

/** The tray icon's on-screen rect, in logical pixels — used to anchor the notification popover. */
export interface TrayIconRect {
  x: number
  y: number
  width: number
  height: number
}

/** `null` when the tray icon's rect isn't available (e.g. Linux) — callers fall back to native. */
export const getTrayIconRect = () => invoke<TrayIconRect | null>('get_tray_icon_rect')

/** Plays a named macOS system sound (e.g. `'Pop'`) standalone, with no notification banner. */
export const playSystemSound = (name: string) => invoke<void>('play_system_sound', { name })

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

/** Whether `oid` is HEAD or one of its ancestors (i.e. on the current branch). */
export const isCommitOnCurrentBranch = (path: string, oid: string) =>
  invoke<boolean>('is_commit_on_current_branch', { path, oid })

// ─── Remote ───────────────────────────────────────────────────────────────────

/**
 * What a transfer is doing. Mirrors the Rust `RemoteProgressPhase`.
 *
 * A fetch downloads objects and then resolves deltas locally; a push uploads. Three phases rather
 * than one bar because a single percentage that resets partway through reads as a bug.
 */
export type RemoteProgressPhase = 'receiving' | 'resolving' | 'writing'

/** Which operation a progress report belongs to. A pull's transfer *is* a fetch's, so the
 *  operation is carried explicitly rather than inferred. */
export type RemoteOperation = 'fetch' | 'pull' | 'push'

/** Payload of {@link REMOTE_PROGRESS_EVENT}. Mirrors the Rust `RemoteProgressEvent`. */
export interface RemoteProgressEvent {
  repoPath: string
  operation: RemoteOperation
  phase: RemoteProgressPhase
  completed: number
  /** `0` while the server hasn't announced a count — render that indeterminate, not as 0 %. */
  total: number
  bytes: number
}

/**
 * Pushed by `commands/remote.rs` while a transfer runs, rate-limited to a few times a second.
 *
 * Pushed rather than polled because a network transfer has no await point to interrogate, and the
 * command's own promise only settles when the whole thing is over — which on the transfers worth
 * reporting is minutes away.
 */
export const REMOTE_PROGRESS_EVENT = 'remote-progress'

/** Payload of {@link HOOK_PROGRESS_EVENT}. Mirrors the Rust `HookProgressEvent`. */
export interface HookProgressEvent {
  repoPath: string
  /** `pre-commit`, `commit-msg`, `pre-push`, … */
  name: string
  phase: 'started' | 'finished'
  /** Only on `finished`. */
  success?: boolean
}

/**
 * Pushed by `hook_progress.rs` when a repository hook starts and again when it stops.
 *
 * A hook is the one part of a commit or a push whose duration belongs to the user rather than to
 * this app — `lint-staged` over a large change, a test suite gating a push — and the command's own
 * promise only settles once it is over. Only ever sent for a hook that actually exists.
 */
export const HOOK_PROGRESS_EVENT = 'hook-progress'

export const fetchRemote = (path: string, remote?: string, prune?: boolean) =>
  invoke<{ remote: string; updatedRefs: string[] }>('fetch_remote', { path, remote, prune })

/**
 * How a pull integrates the fetched commits once the branch has diverged. Mirrors the Rust
 * `PullStrategy` (serialized kebab-case). None of them ever leave the repo paused on a conflict:
 * `fast-forward-only` refuses up front, the other two undo their work and report the paths.
 */
export type PullStrategy = 'fast-forward-if-possible' | 'fast-forward-only' | 'rebase'

export interface PullResult {
  fastForwarded: boolean
  commitsMerged: number
  conflicts: string[]
  /** A merge commit was created because the branches had diverged. */
  merged: boolean
  /** The local-only commits were replayed on top of the fetched tip. */
  rebased: boolean
}

export const pullBranch = (path: string, remote?: string, strategy?: PullStrategy) =>
  invoke<PullResult>('pull_branch', { path, remote, strategy })

/**
 * `skipHooks` is `git push --no-verify`.
 *
 * `pre-push` runs by default, which is the fix rather than the feature: libgit2 runs no hook of
 * any kind, so a repository's `pre-push` was silently skipped for every push made from this app
 * while the same push from a terminal ran it.
 */
export const pushBranch = (path: string, remote?: string, force?: boolean, skipHooks?: boolean) =>
  invoke<void>('push_branch', { path, remote, force, skipHooks })

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

// ─── Cherry-pick ──────────────────────────────────────────────────────────────

export const cherryPickCommit = (path: string, oid: string) =>
  invoke<string>('cherry_pick_commit', { path, oid })

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

// ─── Package health check ─────────────────────────────────────────────────────

export const hasPackageManifest = (path: string) =>
  invoke<boolean>('has_package_manifest', { path })

export const runPackageHealthCheck = (path: string) =>
  invoke<import('@git-manager/git-types').PackageHealthReport>('run_package_health_check', { path })

export const checkOutdatedPackages = (path: string, packageManager: string) =>
  invoke<import('@git-manager/git-types').OutdatedReport>('check_outdated_packages', {
    path,
    packageManager,
  })

export const getPackageChangelog = (
  path: string,
  name: string,
  from: string,
  to: string,
  token?: string
) =>
  invoke<import('@git-manager/git-types').PackageChangelog>('get_package_changelog', {
    path,
    name,
    from,
    to,
    token,
  })

export const scanPackageUsage = (path: string, name: string) =>
  invoke<import('@git-manager/git-types').PackageUsage>('scan_package_usage', { path, name })

export const updatePackages = (
  path: string,
  packageManager: string,
  names: string[],
  toLatest: boolean
) =>
  invoke<import('@git-manager/git-types').UpdateOutcome>('update_packages', {
    path,
    packageManager,
    names,
    toLatest,
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

// ─── GitLab OAuth (device flow) ───────────────────────────────────────────────
//
// Same shape as GitHub's above, plus the two things GitLab needs and GitHub does not: the
// *instance* (gitlab.com or a self-hosted server) and, for a self-hosted one, its own client id —
// every instance keeps a separate application registry, so the shipped gitlab.com id means nothing
// there. Passing `null` uses the shipped one.

export interface GitLabDeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  /** `verification_uri` with the code already filled in — GitLab provides this, GitHub does not. */
  verification_uri_complete: string | null
  expires_in: number
  interval: number
}

export interface GitLabUserInfo {
  username: string
  name: string | null
  email: string | null
  avatarUrl: string | null
}

export const gitlabDeviceCode = (instanceUrl: string, clientId: string | null, scope: string) =>
  invoke<GitLabDeviceCodeResponse>('gitlab_device_code', { instanceUrl, clientId, scope })

export const gitlabPollToken = (instanceUrl: string, clientId: string | null, deviceCode: string) =>
  invoke<PollTokenResponse>('gitlab_poll_token', { instanceUrl, clientId, deviceCode })

export const gitlabGetUser = (instanceUrl: string, token: string) =>
  invoke<GitLabUserInfo>('gitlab_get_user', { instanceUrl, token })

// ─── Bitbucket (token, validated) ─────────────────────────────────────────────

export interface BitbucketUserInfo {
  accountId: string
  displayName: string
  nickname: string | null
  avatarUrl: string | null
}

/** Verifies an app password / API token by asking Bitbucket who it belongs to. */
export const bitbucketGetUser = (username: string, token: string) =>
  invoke<BitbucketUserInfo>('bitbucket_get_user', { username, token })

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
export const githubCommitAvatars = (token: string, owner: string, repo: string, shas: string[]) =>
  invoke<Record<string, string>>('github_commit_avatars', { token, owner, repo, shas })

/** Detects the repo's GitHub PR template(s) on disk (single file, multi-template dir, or none). */
export const getPrTemplate = (path: string) =>
  invoke<PrTemplateDetection>('get_pr_template', { path })

// ─── Extended Repo Stats & Tools ─────────────────────────────────────────────

export const getRepoSummary = (path: string) => invoke<GitRepoSummary>('get_repo_summary', { path })

export const openInEditor = (path: string, command: string) =>
  invoke<void>('open_in_editor', { path, command })

/** Reveals an arbitrary filesystem path in the Finder — e.g. a linked worktree's directory. */
export const revealPathInFinder = (path: string) => invoke<void>('reveal_path_in_finder', { path })

export const getRepoReadme = (path: string) => invoke<string>('get_repo_readme', { path })

export const getTerminalCommands = () =>
  invoke<TerminalHistorySource[]>('get_terminal_commands')

/** Runs a project task's `command` in the configured external terminal (`terminalCommand`, empty →
 * system default), with `path` (the repo) as the working directory. */
export const runTaskInTerminal = (path: string, command: string, terminalCommand: string) =>
  invoke<void>('run_task_in_terminal', { path, command, terminalCommand })

/** Lists runnable commands declared by the project at `path` (today: package.json scripts). */
export const getProjectCommands = (path: string) =>
  invoke<ProjectCommand[]>('get_project_commands', { path })

// ─── Integrated terminal (PTY) ───────────────────────────────────────────────

/** Opens a PTY-backed login shell in `cwd`, sized `cols`×`rows`. Returns the session id used for
 * writes/resizes/close and to subscribe to `terminal:output:<id>` / `terminal:exit:<id>` events. */
export const terminalOpen = (cwd: string, cols: number, rows: number) =>
  invoke<string>('terminal_open', { cwd, cols, rows })

/** Writes keystrokes/pasted text to the shell's stdin. */
export const terminalWrite = (id: string, data: string) =>
  invoke<void>('terminal_write', { id, data })

/** Resizes the PTY to match the xterm.js viewport (character cells). */
export const terminalResize = (id: string, cols: number, rows: number) =>
  invoke<void>('terminal_resize', { id, cols, rows })

/** Kills the shell process and drops the session. */
export const terminalClose = (id: string) => invoke<void>('terminal_close', { id })

// ─── SSH ─────────────────────────────────────────────────────────────────────

export const generateSshKey = (
  keyType: string,
  bits: number | null,
  comment: string,
  path: string,
  passphrase?: string
) => invoke<string>('generate_ssh_key', { keyType, bits, comment, path, passphrase })

export const readSshPublicKey = (path: string) => invoke<string>('read_ssh_public_key', { path })

// ─── Board (Kanban) — local, git-native backend ───────────────────────────────

export const listBoards = (path: string) => invoke<Board[]>('list_boards', { path })

export const getBoard = (path: string, boardId: string) =>
  invoke<BoardWithCards>('get_board', { path, boardId })

export const createBoard = (
  path: string,
  name: string,
  columns: BoardColumn[],
  dodTemplate: string,
  cardPrefix: string
) => invoke<Board>('create_board', { path, name, columns, dodTemplate, cardPrefix })

export const updateBoardMeta = (
  path: string,
  boardId: string,
  name: string,
  tags: BoardTag[],
  dodTemplate: string,
  cardPrefixes: string[],
  expectedRevision: string
) =>
  invoke<Board>('update_board_meta', {
    path,
    boardId,
    name,
    tags,
    dodTemplate,
    cardPrefixes,
    expectedRevision,
  })

export const closeBoard = (
  path: string,
  boardId: string,
  summary: SprintSummary,
  expectedRevision: string
) => invoke<Board>('close_board', { path, boardId, summary, expectedRevision })

/** Moves cards between boards preserving their id, identifier, comments and DOD — the sprint
 * carry-over, and the "move this ticket to another board" action. `toColumnId` is omitted by the
 * former, which wants each card's own column where the target board has it. */
export const moveBoardCards = (
  path: string,
  fromBoardId: string,
  toBoardId: string,
  cardIds: string[],
  toColumnId?: string
) =>
  invoke<void>('move_board_cards', {
    path,
    fromBoardId,
    toBoardId,
    cardIds,
    toColumnId: toColumnId ?? null,
  })

export const updateBoardColumns = (
  path: string,
  boardId: string,
  columns: BoardColumn[],
  expectedRevision: string
) => invoke<Board>('update_board_columns', { path, boardId, columns, expectedRevision })

export const deleteBoard = (path: string, boardId: string) =>
  invoke<void>('delete_board', { path, boardId })

export const createBoardCard = (
  path: string,
  boardId: string,
  columnId: string,
  card: NewBoardCard
) => invoke<BoardCard>('create_board_card', { path, boardId, columnId, card })

export const updateBoardCard = (
  path: string,
  boardId: string,
  cardId: string,
  patch: BoardCardPatch,
  expectedRevision: string
) => invoke<BoardCard>('update_board_card', { path, boardId, cardId, patch, expectedRevision })

export const moveBoardCard = (
  path: string,
  boardId: string,
  cardId: string,
  columnId: string,
  order: number,
  expectedRevision: string
) =>
  invoke<BoardCard>('move_board_card', { path, boardId, cardId, columnId, order, expectedRevision })

/** The comment's author is stamped in Rust from the repo's git signature, so none is passed here. */
export const addBoardCardComment = (
  path: string,
  boardId: string,
  cardId: string,
  body: string,
  expectedRevision: string
) => invoke<BoardCard>('add_board_card_comment', { path, boardId, cardId, body, expectedRevision })

export const deleteBoardCard = (path: string, boardId: string, cardId: string) =>
  invoke<void>('delete_board_card', { path, boardId, cardId })

export const getBoardHistory = (path: string, boardId: string) =>
  invoke<GitCommit[]>('get_board_history', { path, boardId })

export const listRecoverableBoards = (path: string) =>
  invoke<Board[]>('list_recoverable_boards', { path })

export const restoreBoardBackup = (path: string, boardId: string) =>
  invoke<Board>('restore_board_backup', { path, boardId })

// ─── Board (Kanban) — remote board's committed config file ────────────────────

export const writeBoardConfig = (path: string, contents: string) =>
  invoke<void>('write_board_config', { path, contents })

/** `null` when `.git-manager/board.json` doesn't exist yet (no remote board created in this repo). */
export const readBoardConfig = (path: string) =>
  invoke<string | null>('read_board_config', { path })

/** Writes a card attachment into `.git-manager/attachments/` and returns its repo-relative path.
 * The stored filename is the content's own blob hash, so the same image pasted twice is stored once;
 * `fileName` only contributes its extension. */
export const saveBoardAttachment = (path: string, fileName: string, bytes: number[]) =>
  invoke<string>('save_board_attachment', { path, fileName, bytes })
