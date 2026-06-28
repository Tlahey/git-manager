// ─── Repository ───────────────────────────────────────────────────────────────

export interface GitRepo {
  path: string
  name: string
  head: string
  isDetached: boolean
  isDirty: boolean
  remotes: string[]
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

export type GitRefType = 'branch' | 'tag' | 'remote' | 'HEAD'

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

export interface AppSettings {
  ollama: OllamaSettings
  git: GitSettings
  appearance: AppearanceSettings
  language: 'fr' | 'en'
  advanced: AdvancedSettings
  github?: GitHubSettings
}


export interface OllamaSettings {
  url: string
  model: string
  temperature: number
  timeoutSeconds: number
  systemPrompt: string
  includeRepoContext: boolean
  autoDetectScope: boolean
}

export interface GitSettings {
  defaultAuthorName: string
  defaultAuthorEmail: string
  protectedBranches: string[]
  autoFetchIntervalMinutes: number | null
  showRemoteBranches: boolean
  confirmBeforeForcePush: boolean
}

export interface AppearanceSettings {
  theme: string
  fontSize: number
  density: 'compact' | 'normal' | 'comfortable'
  showAvatars: boolean
  enableAnimations: boolean
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

// ─── Ollama ───────────────────────────────────────────────────────────────────

export interface OllamaStatus {
  connected: boolean
  models: string[]
  version?: string
}
