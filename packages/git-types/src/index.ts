import type { AiConnectionConfig } from '@git-manager/ai'

// ─── Repository ───────────────────────────────────────────────────────────────

export interface GitRepo {
  path: string
  name: string
  head: string
  isDetached: boolean
  isDirty: boolean
  remotes: string[]
  /** Path of the main worktree that owns this repo. Equal to `path` for a normal repo/main
   * worktree; for a linked worktree it's the owning repository's main worktree. Per-repo settings
   * are scoped to this so every worktree shares the owning repo's configuration. Optional only so
   * older cached snapshots / test fixtures stay valid — the Rust backend always populates it. */
  mainWorktreePath?: string
}

// ─── Commits ──────────────────────────────────────────────────────────────────

export interface GitSignature {
  name: string
  email: string
  timestamp: number
}

export interface GitCommit {
  oid: string
  shortOid: string
  message: string
  subject: string
  body: string
  author: GitSignature
  committer: GitSignature
  parentOids: string[]
}

// ─── Blame / File history ─────────────────────────────────────────────────────

/** One contiguous run of lines attributed to a single commit (mirrors `git_blame::BlameHunk`). */
export interface BlameHunk {
  /** 1-based line number of the first line of the run. */
  startLine: number
  lineCount: number
  commitOid: string
  shortOid: string
  authorName: string
  authorEmail: string
  /** Author time, Unix epoch seconds. */
  timestamp: number
  summary: string
  body: string
}

export type FileHistoryStatus = 'added' | 'modified' | 'deleted' | 'renamed'

/** A commit that modified a given file (mirrors `git_blame::FileHistoryEntry`). */
export interface FileHistoryEntry {
  oid: string
  shortOid: string
  authorName: string
  authorEmail: string
  timestamp: number
  summary: string
  body: string
  /** How the file changed in this commit. */
  status: FileHistoryStatus
}

// ─── Graph ────────────────────────────────────────────────────────────────────

export interface GitGraphNode {
  commit: GitCommit
  column: number
  color: string
  connections: GitGraphEdge[]
  refs: GitRef[]
}

export interface GitGraphEdge {
  fromColumn: number
  toColumn: number
  color: string
  dashed?: boolean
  startsAtNode?: boolean
  endsAtNode?: boolean
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

export type GitRefType = 'branch' | 'tag' | 'remote' | 'HEAD' | 'stash'

export interface GitRef {
  name: string
  shortName: string
  type: GitRefType
  commitOid: string
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export interface GitBranch {
  name: string
  shortName: string
  isHead: boolean
  isRemote: boolean
  upstream?: string
  commitOid: string
  commitMessage: string
  commitTimestamp: number
  aheadCount: number
  behindCount: number
}

export type MergeStrategy = 'merge' | 'fast-forward' | 'squash'

// ─── Status ───────────────────────────────────────────────────────────────────

export type FileStatusKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typechange'

export interface GitStatusEntry {
  path: string
  status: FileStatusKind
  oldPath?: string
}

export interface GitStatus {
  staged: GitStatusEntry[]
  unstaged: GitStatusEntry[]
  untracked: string[]
  conflicted: string[]
}

// ─── Diff ─────────────────────────────────────────────────────────────────────

export interface GitDiffFile {
  oldPath: string
  newPath: string
  status: FileStatusKind
  additions: number
  deletions: number
  hunks: GitDiffHunk[]
  isBinary: boolean
}

export interface GitDiffHunk {
  header: string
  lines: GitDiffLine[]
}

export interface GitDiffLine {
  origin: '+' | '-' | ' ' | '\\'
  content: string
  oldLineno: number | null
  newLineno: number | null
}

export interface GitDiff {
  files: GitDiffFile[]
  totalAdditions: number
  totalDeletions: number
}

// ─── Submodules ───────────────────────────────────────────────────────────────

export interface GitSubmodule {
  path: string
  url: string
  headOid: string
}

// ─── Pull Requests ────────────────────────────────────────────────────────────

export type PrState = 'open' | 'closed' | 'merged' | 'draft'
export type PrCiStatus = 'success' | 'failure' | 'pending' | null

export interface PullRequest {
  number: number
  title: string
  body: string
  state: PrState
  author: string
  authorAvatar: string
  headRef: string
  baseRef: string
  url: string
  ciStatus: PrCiStatus
  createdAt: string
  updatedAt: string
  isDraft: boolean
}

/** One template inside a `PULL_REQUEST_TEMPLATE/` directory. `name` is the file name (GitHub's
 * `?template=` value). Mirrors the Rust `PrTemplateOption`. */
export interface PrTemplateOption {
  name: string
  content: string
}

/** The repo's GitHub PR template(s), as detected on disk. Mirrors the Rust `PrTemplateDetection`
 * enum (`#[serde(tag = "kind")]`). `none` = no template, `single` = one top-level template file,
 * `multiple` = a chooser directory. */
export type PrTemplateDetection =
  | { kind: 'none' }
  | { kind: 'single'; source: string; content: string }
  | { kind: 'multiple'; options: PrTemplateOption[] }

// ─── Stash ────────────────────────────────────────────────────────────────────

export interface GitStash {
  index: number
  message: string
  branch: string
  commitOid: string
  timestamp: number
  filesCount: number
  additions: number
  deletions: number
}

// ─── Worktree ─────────────────────────────────────────────────────────────────

export interface GitWorktree {
  path: string
  branch: string
  commitOid: string
  isMain: boolean
  isLocked: boolean
  isDirty: boolean
  isPrunable: boolean
  lockedReason?: string
}

/** Outcome of `add_worktree` after optional default-file copying: repo-relative paths actually
 * copied into the new worktree, and configured glob patterns that matched nothing. */
export interface WorktreeAddResult {
  copied: string[]
  skipped: string[]
}

/** Which AI coding agent is detected working in a worktree. A string union kept open-ended on the
 * wire (Rust sends a plain string) so new agents don't force a breaking change; `'unknown'` is the
 * frontend's fallback bucket for an agent id it doesn't have a logo for yet. */
export type WorktreeAgentKind = 'claude' | 'gpt' | 'gemini' | 'grok' | 'copilot' | 'unknown'

/** How far along the detected agent is on its current turn. `'working'` = actively producing
 * output; `'idle'` = a session is open but quiet (likely awaiting input). */
export type WorktreeAgentState = 'working' | 'idle'

/** Live signal that an AI coding agent is running inside a worktree, derived from the agent's
 * on-disk session logs (see `services/agent_session.rs`). Only worktrees with a recent session are
 * returned — a quiet/absent worktree has no entry. */
export interface WorktreeAgentActivity {
  /** Absolute path of the worktree the agent is working in. */
  path: string
  /** Agent id — `'claude'` today. Widen via {@link WorktreeAgentKind} as detectors are added. */
  agent: string
  /** `'working'` or `'idle'` — see {@link WorktreeAgentState}. */
  state: string
  /** Epoch-millis mtime of the most recently touched session log for this worktree. */
  lastActivityMs: number
}

// ─── Rebase ───────────────────────────────────────────────────────────────────

export type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop'

export interface RebaseStep {
  action: RebaseAction
  oid: string
  message: string
}

export type RebaseStateKind = 'idle' | 'in_progress' | 'conflict' | 'edit_pause'

export interface RebaseState {
  kind: RebaseStateKind
  currentStep?: number
  totalSteps?: number
  currentOid?: string
  conflictedFiles?: string[]
  branchName?: string
  currentMessage?: string
}

// ─── Interactive rebase (Rebasing Commit editor) ─────────────────────────────

export type RebaseTodoAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

/** Mirrors `RebaseTodoStep` in `services/git_interactive_rebase.rs`. */
export interface RebaseTodoStep {
  action: RebaseTodoAction
  oid: string
  /** Replacement commit message (reword, or custom squash result message). */
  message?: string
}

// ─── Conflict Resolution (3-way merge editor) ─────────────────────────────────

export type MergeBlockKind =
  | 'unchanged'
  | 'ours-only'
  | 'theirs-only'
  | 'both-same'
  | 'both-different'

export interface MergeBlock {
  blockId: number
  kind: MergeBlockKind
  oursStartLine: number
  oursLineCount: number
  theirsStartLine: number
  theirsLineCount: number
  oursLines: string[]
  theirsLines: string[]
  baseLines?: string[]
}

export interface ThreeWayMergeView {
  filePath: string
  renderable: boolean
  isBinary: boolean
  conflictKind?: 'delete' | 'rename'
  blocks: MergeBlock[]
  oursText: string
  theirsText: string
  conflictCount: number
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface GitHubUser {
  login: string
  name: string | null
  email: string | null
  avatarUrl: string
}

export interface GitHubAccount {
  id: string
  token: string
  user: GitHubUser
}

export interface GitHubSettings {
  accounts: GitHubAccount[]
  activeAccountId: string | null
}

/** Settings for the AI "daily summary" launchpad briefing. Deliberately kept OUT of `ai` (which is
 * connection-only): these tune *whether/when* the feature runs, not how to reach a provider. */
export interface DailySummarySettings {
  /** Master switch — when false the feature is hidden from the launchpad and never generates. */
  enabled: boolean
  /** When true, a stale per-project summary is regenerated automatically the first time the
   * launchpad is opened each morning; when false the user triggers it manually. */
  autoGenerate: boolean
}

/**
 * A user-defined project task runnable from the toolbar (e.g. "Lancer l'app" → `pnpm dev`, "Tests"
 * → `pnpm test`). Stored per-repo in `RepoScopedSettings.runTasks`; the command is executed in the
 * user's configured external terminal, in the repo directory.
 */
export interface RunTask {
  /** Stable id (e.g. `crypto.randomUUID()`), used to pick the default task and as a React key. */
  id: string
  /** Human label shown in the toolbar dropdown. */
  name: string
  /** Shell command run in the external terminal at the repo root (e.g. `pnpm dev`). */
  command: string
}

/**
 * A runnable command discovered in the project (today: a package.json script), surfaced as an
 * autocomplete suggestion in the task editor. Mirrors the Rust `ProjectCommand`.
 */
export interface ProjectCommand {
  /** The script name, e.g. `dev`. */
  name: string
  /** The shell command that runs it via the detected package manager, e.g. `pnpm dev`. */
  command: string
  /** The raw script body, shown as a hint, e.g. `vite`. Absent when unknown. */
  detail?: string
  /** Where this command came from, e.g. `package.json`. */
  source: string
}

/**
 * The subset of settings that can be overridden per repository, stored locally keyed by repo path
 * in `AppSettings.repoOverrides`. Every field is optional: `undefined` means "inherit the global
 * value". Resolution is always `repoOverride ?? global` (see `useEffectiveRepoSettings`).
 */
export interface RepoScopedSettings {
  /** Branches protected from destructive actions (reset, force-push) in this repo. Per-repo only —
   * there is no global fallback, so an absent value means "no protected branches". */
  protectedBranches?: string[]
  /** Branch name used when initializing a new repository. Per-repo only; absent = `main`. */
  defaultBranchName?: string
  /** Overrides `git.commitInstructions` for this repo. */
  commitInstructions?: string
  /** Overrides `git.commitPattern` for this repo. */
  commitPattern?: string
  /** Overrides `appearance.theme` for this repo. */
  theme?: string
  /** Glob patterns for gitignored local files (`.env`, local config, …) to copy from this repo
   * into every newly created worktree. Per-repo only — there is no global fallback, so an absent
   * value means "no default files". See `WorktreeAddResult` for the copy outcome. */
  worktreeDefaultFiles?: string[]
  /** Project tasks runnable from the toolbar's "Lancer" button. Per-repo only (no global fallback);
   * an absent value means "no tasks". */
  runTasks?: RunTask[]
  /** Id of the `runTasks` entry launched by the primary "Lancer" button. Falls back to the first
   * task when absent or dangling. Per-repo only. */
  defaultRunTaskId?: string
}

export interface AppSettings {
  ai: AiConnectionConfig
  git: GitSettings
  appearance: AppearanceSettings
  language: 'fr' | 'en'
  advanced: AdvancedSettings
  github?: GitHubSettings
  ssh?: SSHSettings
  externalTools?: ExternalToolsSettings
  notifications?: NotificationSettings
  integrations?: IntegrationSettings
  dailySummary?: DailySummarySettings
  /** Per-repository overrides for the subset of settings in `RepoScopedSettings`, keyed by repo
   * path. A repo absent from this map (or with an absent field) inherits every global setting. */
  repoOverrides: Record<string, RepoScopedSettings>
}

export interface ProviderAccount {
  id: string
  host: string
  token: string
  username: string
  avatarUrl?: string
}

export interface IntegrationSettings {
  gitlabAccounts: ProviderAccount[]
  gitlabActiveAccountId: string | null
  bitbucketAccounts: ProviderAccount[]
  bitbucketActiveAccountId: string | null
}

export interface SSHSettings {
  privateKeyPath: string
  publicKeyPath: string
  useSystemAgent: boolean
}

export interface ExternalToolsSettings {
  /** Absolute path to the user-picked terminal .app (or executable). Empty = not configured. */
  externalTerminalCommand: string
}

export interface NotificationSettings {
  enabled: boolean
  notifyOnFetch: boolean
  notifyOnPull: boolean
  notifyOnPush: boolean
  enableSound: boolean
  soundName?: string
  notifyOnPrMerged?: boolean
  notifyOnReviewRequested?: boolean
  notifyOnReviewStatusChanged?: boolean
  notifyOnNewPr?: boolean
}

export interface GitSettings {
  defaultAuthorName: string
  defaultAuthorEmail: string
  showStashesInGraph?: boolean
  /** How many commits to load into the Graph on first render. Minimum 500; default 2000. When
   * `lazyLoadGraphCommits` is enabled, more are fetched as the user reaches the earliest loaded
   * commit. */
  initialGraphCommits?: number
  /** Whether the Graph fetches additional commits once the user scrolls to the earliest loaded
   * commit. Enabled by default. */
  lazyLoadGraphCommits?: boolean
  /** Absolute path to the user-picked editor .app (or executable). Empty = not configured. */
  externalEditorCommand: string
  /** User-authored guidance on how commit messages should be written (free text). Fed to the AI
   * commit features as an authoritative style source, alongside the repo's commitlint config and
   * recent history. Empty = no extra guidance. */
  commitInstructions?: string
  /** Optional regular expression the generated commit subject must match. Injected into the prompt
   * and used by the lightweight validator. Empty = no pattern constraint. */
  commitPattern?: string
  /** Prune deleted remote-tracking branches on fetch (`git fetch --prune`). Enabled by default. */
  autoPrune?: boolean
  /** Interval, in minutes, at which the active repo is fetched automatically. 0 disables it. Range
   * 0–60; default 1. */
  autoFetchIntervalMinutes?: number
}

export interface AppearanceSettings {
  theme: string
  fontSize: number
  density: 'compact' | 'normal' | 'comfortable'
  showAvatars: boolean
  enableAnimations: boolean
  notificationLocation?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  rowHeight?: 'standard' | 'small'
  /** Monaco's sticky scroll (pins the enclosing function/class header to the top of the pane
   * while scrolling through its body). Off by default — see `settings.appearance.stickyScroll`. */
  stickyScroll?: boolean
}

export interface UserTheme {
  id: string
  name: string
  css: string
}

export interface AdvancedSettings {
  scanExclusions: string[]
  maxScanDepth: number
}

// ─── IPC Errors ───────────────────────────────────────────────────────────────

export interface AppError {
  code: string
  message: string
  detail?: string
}

export interface GitRepoSummary {
  path: string
  name: string
  head: string
  isDetached: boolean
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  conflictedCount: number
  aheadCount: number
  behindCount: number
}
