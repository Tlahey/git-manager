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

/**
 * Mirrors `HeadOverride` in `services/git_graph.rs`. Asks `get_log` to build the graph *as if*
 * `branch` pointed at `oid` — the undo/redo timeline's read-only preview. Nothing is written; the
 * walk is seeded from `oid` and the branch/HEAD badges are relabelled onto it, so the previewed
 * graph comes out of the same layout code as the real one.
 */
export interface GitLogHeadOverride {
  /** Short branch name to relocate, e.g. `main`. Empty on a detached HEAD. */
  branch: string
  /** Commit the branch is pretended to point at. */
  oid: string
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

/**
 * How the checked-out branch relates to its merge target — the branch the work is meant to land on
 * (`origin/main` by default, configurable per repo via `RepoScopedSettings.targetBranches`).
 * Mirrors the Rust `MergeTargetStatus`; the merge is only simulated in memory, nothing is written.
 */
export interface MergeTargetStatus {
  /** The resolved target ref (e.g. `origin/main`), or `null` when no candidate exists in the repo. */
  target: string | null
  /** Short name of the checked-out branch, or `null` on a detached HEAD. */
  currentBranch: string | null
  /** `true` when HEAD is the target itself (same ref, or tracking it) — nothing to merge. */
  onTarget: boolean
  /** `true` when merging HEAD into `target` would conflict. */
  hasConflicts: boolean
  /** Paths that would conflict, sorted. Empty unless `hasConflicts`. */
  conflictedFiles: string[]
  /** Commits on HEAD the target doesn't have. */
  ahead: number
  /** Commits on the target HEAD doesn't have. */
  behind: number
}

// ─── Status ───────────────────────────────────────────────────────────────────

/** Git's short status word. `untracked` only ever reaches a {@link GitDiffFile} — `get_file_diff`
 * substitutes it for `added` when diffing a file git doesn't know yet (see `force_untracked_status`
 * in `services/git_diff.rs`), whereas {@link GitStatus} keeps untracked paths in their own list. */
export type FileStatusKind =
  'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typechange' | 'untracked'

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

// ─── Dependency (node_modules) patching ───────────────────────────────────────

export interface PatchableDependency {
  name: string
  version: string
  installed: boolean
  patched: boolean
}

export interface PreparedDependencyPatch {
  editDir: string
  diff: string
  unchanged: boolean
}

export interface CommittedDependencyPatch {
  patchFile: string
  key: string
}

// ─── Package health check ─────────────────────────────────────────────────────

/** `skipped` means the check's prerequisite is missing (e.g. no `node_modules`). */
export type HealthSeverity = 'ok' | 'skipped' | 'warning' | 'error'

/** Ids the backend emits; each maps to a translated title/description. */
export type HealthCheckId =
  | 'versionAlignment'
  | 'catalogDrift'
  | 'workspaceProtocol'
  | 'duplicateDependency'
  | 'missingInstall'
  | 'rangeMismatch'
  | 'packageManagerField'

/** One place a dependency is declared. */
export interface DependencyRef {
  package: string
  path: string
  field: string
  range: string
}

export interface HealthFinding {
  severity: HealthSeverity
  /** Null for repo-level findings (e.g. the `packageManager` field). */
  dependency: string | null
  refs: DependencyRef[]
  actual: string | null
  expected: string | null
}

export interface HealthCheck {
  id: HealthCheckId
  severity: HealthSeverity
  findings: HealthFinding[]
}

export interface HealthWorkspacePackage {
  name: string
  path: string
  version: string | null
  private: boolean
  dependencyCount: number
}

export interface PackageHealthReport {
  packageManager: string
  hasCatalog: boolean
  packages: HealthWorkspacePackage[]
  /** Distinct third-party dependency names across the workspace. */
  dependencyCount: number
  checks: HealthCheck[]
}

/** `toolMissing`: the package manager isn't on PATH. `unsupported`: it has no machine-readable `outdated`. */
export type OutdatedStatus = 'ok' | 'toolMissing' | 'unsupported'

export interface OutdatedPackage {
  name: string
  current: string
  /** Newest version the declared range allows. */
  wanted: string
  /** Newest version published — may be a major bump. */
  latest: string
  majorUpdate: boolean
  deprecated: boolean
}

export interface OutdatedReport {
  packageManager: string
  status: OutdatedStatus
  packages: OutdatedPackage[]
}

export interface ChangelogRelease {
  tag: string
  /** Often empty; fall back to the tag. */
  name: string
  publishedAt: string
  /** Markdown body of the release notes. */
  body: string
  url: string
}

export interface PackageChangelog {
  /** `owner/repo`, or null when the package declares no GitHub repository. */
  repository: string | null
  releasesUrl: string | null
  releases: ChangelogRelease[]
  /**
   * True when release tags matched the version range. False with a non-empty
   * `releases` means these are the most recent ones, not the ones being installed.
   */
  matched: boolean
}

export interface UpdateOutcome {
  updated: string[]
  /** The package manager's own report, shown verbatim. */
  output: string
}

export interface PackageUsageSample {
  path: string
  line: number
  text: string
}

/** What the repo imports from a dependency — the surface an upgrade could break. */
export interface PackageUsage {
  name: string
  /** Importing files, before the list below is capped. */
  fileCount: number
  files: string[]
  symbols: string[]
  /** Subpath entry points in use (`react-dom/client`). */
  subpaths: string[]
  defaultImport: boolean
  namespaceImport: boolean
  samples: PackageUsageSample[]
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

/** A GitHub account attached to a pull request (author, assignee or requested reviewer). */
export interface PrParticipant {
  login: string
  avatarUrl: string
}

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
  /** Accounts assigned to the PR. Drives the sidebar's "Assigned to me" grouping. */
  assignees: PrParticipant[]
  /** Accounts whose review is still requested (GitHub drops one once its review lands). Drives the
   * sidebar's "Awaiting My Review" grouping. */
  requestedReviewers: PrParticipant[]
  labels: string[]
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

// ─── Integrated terminal ──────────────────────────────────────────────────────

/**
 * What one integrated-terminal session is doing right now. Mirrors `TerminalStatus` in
 * `apps/desktop/src-tauri/src/models.rs`; derived from the PTY's foreground process group, so it
 * says "a command is running", not "output arrived recently".
 */
export interface TerminalStatus {
  /** The session id `terminal_open` returned. */
  id: string
  /** True while a command holds the foreground (an agent, a build, an editor). */
  busy: boolean
  /** Name of that command (`claude`, `pnpm`, `vim`) when resolvable; never set while idle. */
  command: string | null
}

// ─── Rebase ───────────────────────────────────────────────────────────────────

export type RebaseStateKind = 'idle' | 'in_progress' | 'conflict' | 'edit_pause'

/** Where a step of a running rebase stands — `current` is the one it's paused on. */
export type RebaseProgressStatus = 'done' | 'current' | 'pending'

/**
 * One command of a *running* rebase's todo list. Mirrors `RebaseProgressStep` in
 * `apps/desktop/src-tauri/src/models.rs` — unlike {@link RebaseTodoStep} (a plan the UI
 * submits), this describes work git is executing.
 */
export interface RebaseProgressStep {
  /** 1-based position in the plan, in execution order (oldest first). */
  index: number
  /**
   * Todo command in long form: `pick` | `reword` | `edit` | `squash` | `fixup` | `drop` |
   * `exec` | `break` | `label` | `reset` | `merge` | `update-ref`.
   */
  action: string
  /** Commit being replayed — absent for commands that take none (`exec`, `break`…). */
  oid?: string
  shortOid?: string
  /** Commit subject, or the command's argument text for non-commit commands. */
  subject?: string
  status: RebaseProgressStatus
}

export interface RebaseState {
  kind: RebaseStateKind
  currentStep?: number
  totalSteps?: number
  currentOid?: string
  conflictedFiles?: string[]
  branchName?: string
  currentMessage?: string
  /** The whole todo list in execution order — empty when idle (or on git's am backend). */
  steps: RebaseProgressStep[]
  /** Commit the branch is being replayed onto, with a ref name pointing at it if there is one. */
  ontoOid?: string
  ontoShortOid?: string
  ontoSubject?: string
  ontoLabel?: string
}

// ─── Bisect ──────────────────────────────────────────────────────────────────

/** Mirrors `BisectState` in `apps/desktop/src-tauri/src/models.rs`. */
export interface BisectState {
  /** Whether a bisect session is in progress. */
  active: boolean
  /** Branch the bisect was started from, restored on reset. */
  startBranch?: string
  /** Bisect terms — normally "bad"/"good". */
  badTerm: string
  goodTerm: string
  /** The known-bad commit (`refs/bisect/bad`). */
  badOid?: string
  /** The known-good commits (`refs/bisect/good-*`). */
  goodOids: string[]
  /** Commits explicitly skipped (`refs/bisect/skip-*`). */
  skippedOids: string[]
  /** The commit currently checked out for testing. */
  currentOid?: string
  currentSummary?: string
  currentAuthor?: string
  /** Remaining search space from `git rev-list --bisect-vars`. */
  revsRemaining?: number
  stepsRemaining?: number
  /** Set once the search resolves: the first bad commit and its subject. */
  firstBadOid?: string
  firstBadSummary?: string
}

/** The three ways to mark the commit currently under test. */
export type BisectTerm = 'good' | 'bad' | 'skip'

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
  'unchanged' | 'ours-only' | 'theirs-only' | 'both-same' | 'both-different'

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

// ─── Board (Kanban) ───────────────────────────────────────────────────────────

/** Which backend produced a {@link Board}. The UI renders both generically, but actions (create/
 * move/delete a card, edit columns) must dispatch to the matching `BoardBackend` implementation. */
export type BoardSource = 'local' | 'remote'

/** How urgent a card is. `normal` is the default and, on a GitHub-backed board, is represented by
 * the *absence* of a priority label rather than a `priority:normal` one — so the common case adds no
 * label noise to the repository. */
export type BoardCardPriority = 'high' | 'normal' | 'low'

export interface BoardColumn {
  id: string
  name: string
  order: number
  color?: string
  /** Whether landing in this column means the work is finished. Drives the sprint statistics and
   * decides which cards carry over when a sprint is closed. */
  isDone?: boolean
}

/** One tag in a board's palette. Cards reference these by id ({@link BoardCard.tagIds}) rather than
 * carrying free-form strings, so a given tag is the same colour on every card of the board. */
export interface BoardTag {
  id: string
  name: string
  /** CSS colour as `#rrggbb`. Also used verbatim as the GitHub label colour on a remote board. */
  color: string
}

/** One message in a card's discussion. Append-only: {@link BoardCardPatch} deliberately can't touch
 * these, so a card edit can never rewrite history that someone else wrote. */
export interface BoardComment {
  id: string
  /** Whoever wrote it — the repo's git `user.name` on a local board (stamped in Rust rather than
   * trusted from the frontend), the GitHub login on a remote one. */
  author: string
  /** Markdown. */
  body: string
  createdAt: string
}

/** What kind of work a card stands for. An epic is the one that groups others. */
export type BoardCardKind = 'task' | 'bug' | 'epic'

/**
 * The forward half of a relationship between two cards.
 *
 * Only forward halves are storable, so the set of representable links is exactly the set of
 * meaningful ones: `blocks` is written on the blocker, `contains` on the epic. The inverse
 * (`blockedBy`, `partOf`) is derived when the *other* card is displayed and never written — two
 * stored halves are two things that can disagree, and a half-deleted link is a bug with no natural
 * repair. `relates` is its own inverse.
 */
export type BoardLinkKind = 'relates' | 'blocks' | 'contains'

/** The inverse a link reads as from the target's side. `relates` is symmetric. */
export type BoardLinkInverseKind = 'relates' | 'blockedBy' | 'partOf'

export interface BoardCardLink {
  /** Carried because a card can move to another board and its links must survive that. A link whose
   * target sits on a board that isn't loaded renders as the board's name rather than as a card. */
  targetBoardId: string
  targetCardId: string
  kind: BoardLinkKind
}

/**
 * The GitHub issue a card on a *local* board tracks.
 *
 * Its presence changes where the card's content lives: the issue becomes the source of truth for
 * everything GitHub can hold — title, body, assignee, and the fields encoded as labels — while the
 * local board keeps only this ref and the placement (`columnId`, `order`), which has no
 * GitHub-native home. So a tracked card can be dragged and reordered like any other, and editing one
 * writes to the real issue.
 */
export interface BoardCardSourceIssue {
  owner: string
  repo: string
  number: number
}

/** One issue linked into a board (remote) or a bare markdown task (local). Mirrors the Rust
 * `BoardCard` struct for the local backend; the remote backend builds the same shape client-side
 * from a GitHub issue + its `board:<id>:status:<column>` label. */
export interface BoardCard {
  id: string
  boardId: string
  columnId: string
  title: string
  /** Markdown. */
  description: string
  order: number
  /** Branch created/checked out for this card via the "create/checkout branch" card action. */
  linkedBranch?: string
  /** Worktree created for this card's work via the "create worktree" card action. Distinct from
   * {@link BoardCard.linkedBranch}: a card can have a branch with no worktree, but never a worktree
   * without the branch that owns it. */
  linkedWorktreePath?: string
  /** Optimistic-concurrency token — see {@link Board.revision} (local backend) or the remote
   * backend's use of the source issue's `updated_at`. Sent back on every update so a write that
   * raced another one is rejected instead of silently overwriting it. */
  revision: string
  /** The card's own identifier prefix — `"GM"` renders it as `GM-7`. The card's, not the board's:
   * that is what lets it keep its identifier when it moves to another board. */
  prefix: string
  /** The card's number within its {@link BoardCard.prefix}, shown as `<prefix>-<number>`. Allocated
   * from {@link Board.nextCardNumbers} on a local board; the issue number on a remote one. `0` for
   * cards created before the board had identifiers. */
  number: number
  /** What kind of work this is — drives the icon, and the colour for an epic. */
  kind: BoardCardKind
  /** Relationships this card declares to others — see {@link BoardCardLink}. */
  links: BoardCardLink[]
  /**
   * Set when the card was archived: it leaves the columns but is not destroyed, and searching the
   * board brings it back into view. Distinct from deleting, which is irreversible, and from a done
   * column, which is a *state of the work* rather than a decision to stop showing it. */
  archivedAt?: string
  /** Set when this card tracks a GitHub issue — see {@link BoardCardSourceIssue}. Only meaningful on
   * a `source: 'local'` board; a card on a remote board already *is* an issue. */
  sourceIssue?: BoardCardSourceIssue
  /** The tracked issue's live state, merged in at read time — never stored. `undefined` on an
   * untracked card, and also when the issue could not be fetched, which is why the card keeps its own
   * copy of the content: an unreachable GitHub degrades to stale data, not to a blank card. */
  issueState?: 'open' | 'closed'
  /** The single person responsible. A GitHub login on a remote board (the issue's native assignee),
   * free text on a local one, where the repo has no user directory to pick from. */
  assignee?: string
  priority: BoardCardPriority
  /** `YYYY-MM-DD`. Date only: a deadline with a time of day would be false precision here. */
  dueDate?: string
  /** Ids into the owning {@link Board.tags} palette. */
  tagIds: string[]
  /** Why this card is stuck. **Its presence is the blocked flag** — there is no separate boolean, so
   * "blocked with no stated reason" is unrepresentable rather than merely discouraged. */
  blockedReason?: string
  /** Definition of Done, as a markdown task list (`- [ ] …`). Seeded from {@link Board.dodTemplate}
   * at creation and fully editable per card afterwards. Markdown rather than a structured list
   * because that is already GitHub's native checklist format *and* the app can already render and
   * tick it (`MarkdownRenderer`'s `onTaskToggle` + `toggleTaskListItem`). */
  dod: string
  comments: BoardComment[]
  schemaVersion: number
  updatedAt: string
}

/** Mirrors the Rust `Board` struct (local backend) — the remote backend builds the same shape from
 * `.git-manager/board.json` + GitHub issues/labels, so the UI never branches on `source` except to
 * pick which `BoardBackend` implementation to call. */
export interface Board {
  id: string
  name: string
  source: BoardSource
  columns: BoardColumn[]
  /** Optimistic-concurrency token: for the local backend, the board's ref tip commit oid at read
   * time (a whole-board version stamp — every {@link BoardCard} read alongside it carries the same
   * value); for the remote backend, the board config's own version marker. */
  revision: string
  /** The board's tag palette. */
  tags: BoardTag[]
  /**
   * The identifier prefixes this board offers when a card is created, in the order they were added.
   *
   * The board *offers* them; it does not own them. A card carries its own prefix (see
   * {@link BoardCard.prefix}), which is what lets it keep its identifier when it moves to another
   * board. Removing one here only stops it being offered — every `GM-7` already out there stays
   * `GM-7`.
   */
  cardPrefixes: string[]
  /**
   * The number the next card will take, **per prefix** (local backend only).
   *
   * A stored counter rather than `max(existing) + 1`: deleting the newest card must not hand its
   * number to the next one, or two different tickets end up having been `GM-7`. Per prefix so `GM`
   * and `BUG` each run an unbroken sequence. The remote backend ignores this and uses the issue
   * number, which GitHub already guarantees is unique and stable.
   */
  nextCardNumbers: Record<string, number>
  /** Markdown task list copied into every new card's {@link BoardCard.dod}. Empty for a board that
   * doesn't want one. */
  dodTemplate: string
  /**
   * Whether this board is one **iteration** of a repeating cycle — a sprint — rather than a standing
   * board such as a backlog a ticket passes through before it reaches one.
   *
   * Only an iteration can be closed, because closing freezes a report, carries the leftovers into a
   * successor and turns the board read-only — all descriptions of a period that ended.
   *
   * Optional on the wire, and **absent means `true`**: boards written before this field existed were
   * created when closing was the only behaviour there was. Read it through `isIterationBoard` rather
   * than testing it directly, so that default lives in one place across both backends.
   */
  iteration?: boolean
  /** Set when the sprint was closed. A closed board is read-only and hidden from the default board
   * list — see {@link Board.summary}. */
  closedAt?: string
  /**
   * Set when the board was deleted **but its tickets were archived rather than destroyed**.
   *
   * The board is gone as far as the user is concerned — out of the picker, read-only — yet it still
   * exists, because an archived ticket has to stay attached to something. A card whose board had
   * been erased would name a board that no longer exists, which is not "archived". Revealed by the
   * board picker's "show deleted" toggle, where its archive stays readable.
   */
  deletedAt?: string
  /** Statistics frozen at closing time. Stored rather than recomputed because closing a sprint
   * *moves* its unfinished cards to the successor board: recomputing later would report a sprint
   * that went better than it did. */
  summary?: SprintSummary
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/** A sprint's outcome, computed by `features/board/lib/sprintStats.ts` and frozen onto the board when it is
 * closed. Deliberately computed in TypeScript and *passed to* the backend, so the arithmetic lives
 * once and both backends store the same numbers. */
export interface SprintSummary {
  closedAt: string
  totalCards: number
  doneCards: number
  unfinishedCards: number
  /** Percentage of cards in a done column, 0-100, rounded. `0` for an empty sprint. */
  completionRate: number
  blockedCards: number
  /** Cards past their due date that weren't done. */
  overdueCards: number
  byColumn: { columnId: string; columnName: string; count: number }[]
  byPriority: { priority: BoardCardPriority; count: number }[]
  byAssignee: { assignee: string; total: number; done: number }[]
  /** The successor sprint the unfinished cards were moved into, when one was created. */
  carriedOverToBoardId?: string
}

/** Result of `get_board`/`getBoard`: a board plus every one of its cards in one round trip. */
export interface BoardWithCards {
  board: Board
  cards: BoardCard[]
}

/** Patch applied to one card — every field left `undefined` is left unchanged. Mirrors the Rust
 * `BoardCardPatch`. The nullable fields distinguish "leave unchanged" (omitted) from "clear it"
 * (`null`), since a plain optional can't express that third state.
 *
 * {@link BoardCard.comments} is absent on purpose: comments are append-only through `addComment`, so
 * editing a card can never rewrite what someone else wrote. */
export interface BoardCardPatch {
  title?: string
  description?: string
  columnId?: string
  order?: number
  linkedBranch?: string | null
  linkedWorktreePath?: string | null
  assignee?: string | null
  priority?: BoardCardPriority
  dueDate?: string | null
  tagIds?: string[]
  blockedReason?: string | null
  dod?: string
  /** `null` un-archives; a timestamp archives. */
  archivedAt?: string | null
  /** Starts or stops tracking a GitHub issue. `null` untracks — the card keeps the content it was
   * last showing and becomes an ordinary local card, rather than vanishing with the link. */
  sourceIssue?: BoardCardSourceIssue | null
  kind?: BoardCardKind
  /** The whole link list, replaced wholesale — adding or removing one link is a read-modify-write of
   * this under the board's existing revision check, rather than two more mutations with their own
   * conflict semantics. */
  links?: BoardCardLink[]
}

/** What a new card *is*, as opposed to where it goes — mirrors the Rust `NewBoardCard`. */
export interface NewBoardCard {
  title: string
  description?: string
  /** Which identifier sequence to draw the number from. Empty means an unnumbered card. */
  prefix?: string
  kind?: BoardCardKind
  /** Set to track a GitHub issue from the card's very first commit. */
  sourceIssue?: BoardCardSourceIssue
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface GitHubUser {
  login: string
  name: string | null
  email: string | null
  avatarUrl: string
}

/**
 * A connected GitHub account, as `settings.json` records it — **public information only**.
 *
 * The token used to live here, which is why `~/.git-manager/settings.json` was a file to treat as a
 * secret. It is now in the OS keychain, filed under this account's `id`, and reachable only from
 * Rust: see `src-tauri/src/services/credential_store.rs`. What is left is who is connected, which is
 * all the UI ever needed to render the account list.
 *
 * The `id` *is* the GitHub login. That is what makes signing in twice as the same user replace the
 * entry rather than add a second one, and it is the key the keychain entry is filed under.
 */
export interface GitHubAccount {
  id: string
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
  /** When true, each briefing is *also* written inside the repository under
   * `.git-manager/summaries/`, so the archive travels with the project. Off by default: untracked
   * files in the user's own repos are a visible cost, and the archive under `~/.git-manager/` is
   * already on disk. Enabling it registers `.git-manager/` in `.git/info/exclude` (local-only) so
   * the copies never show up as pending changes. */
  saveToRepo?: boolean
}

/**
 * One archived daily briefing as it exists on disk. Mirrors the Rust `StoredSummaryFile` serde
 * struct — the markdown file is the source of truth, and the frontend re-parses it rather than
 * trusting a cached object.
 */
export interface StoredSummaryFile {
  /** Absolute path of the repository the briefing is about, read back from the front matter. */
  repoPath: string
  /** The repository's display name, read back from the front matter. */
  repoName: string
  /** The day the briefing covers, `YYYY-MM-DD`. */
  date: string
  /** Absolute path of the markdown file — what "open in editor" and "delete" act on. */
  filePath: string
  /** The whole file, front matter included. */
  markdown: string
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
 * One shell history file's `git …` command lines. Mirrors the Rust `TerminalHistorySource`.
 *
 * One entry per file rather than one merged list, because the reward engine spots the commands the
 * user just ran by diffing a read against the previous one, and that only holds on an append-only
 * stream — see `apps/desktop/src/lib/rewards/terminalHistory.ts`.
 */
export interface TerminalHistorySource {
  /** The file's name, e.g. `.zsh_history` — the key a snapshot is tracked under. */
  source: string
  /** Its `git …` lines, oldest first. */
  commands: string[]
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
  /** Candidate merge targets for this repo, most specific first — the branch the current work is
   * meant to be merged into (`origin/main` by default). The first entry that exists in the repo
   * wins; see `MergeTargetStatus`. Per-repo only, falling back to `DEFAULT_TARGET_BRANCHES`. */
  targetBranches?: string[]
  /** Overrides `git.commitInstructions` for this repo. */
  commitInstructions?: string
  /** Overrides `git.commitPattern` for this repo. */
  commitPattern?: string
  /** Overrides `appearance.theme` for this repo. */
  theme?: string
  /** Overrides `appearance.terminalBackground` (integrated terminal background) for this repo. */
  terminalBackground?: string
  /** Overrides `appearance.terminalForeground` (integrated terminal text colour) for this repo. */
  terminalForeground?: string
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

/** Settings for the remote (GitHub-backed) board's `.git-manager/board.json` auto-sync — periodic
 * commit+push of that config file so column/board structure edits reach teammates without a manual
 * commit each time. Off by default: unlike the rest of the sync, this commits and pushes on the
 * user's behalf on a timer, so it follows the same explicit-opt-in convention as e.g. force-push. */
export interface BoardSettings {
  autoSync: {
    enabled: boolean
    intervalMinutes: number
  }
}

export interface AppSettings {
  ai: AiConnectionConfig
  git: GitSettings
  appearance: AppearanceSettings
  language: 'fr' | 'en' | 'es'
  advanced: AdvancedSettings
  github?: GitHubSettings
  ssh?: SSHSettings
  externalTools?: ExternalToolsSettings
  notifications?: NotificationSettings
  integrations?: IntegrationSettings
  dailySummary?: DailySummarySettings
  board?: BoardSettings
  /** Per-repository overrides for the subset of settings in `RepoScopedSettings`, keyed by repo
   * path. A repo absent from this map (or with an absent field) inherits every global setting. */
  repoOverrides: Record<string, RepoScopedSettings>
}

/**
 * A connected GitLab/Bitbucket account. Like {@link GitHubAccount}, it holds no secret: the token is
 * in the OS keychain under this `id`, and only Rust can read it.
 */
export interface ProviderAccount {
  id: string
  host: string
  username: string
  avatarUrl?: string
  /** Display name when the provider gives one distinct from `username` (Bitbucket, GitLab). */
  displayName?: string
  /**
   * How this account was authenticated. `oauth` accounts came from a device flow and hold an
   * access token the provider issued; `token` accounts hold something the user pasted. Recorded
   * because it decides what a re-connection has to do, and because a token the user owns must not
   * be silently replaced by one the app obtained (or the reverse).
   */
  authMethod?: 'oauth' | 'token'
  /**
   * The OAuth application id this account was obtained with — only for a self-hosted GitLab, whose
   * instance has its own application registry and therefore its own id. Kept with the account so
   * re-authenticating later does not ask for it again.
   */
  clientId?: string
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
  /** Shell command the integrated terminal's "launch agent" button sends to the active session —
   * see `TerminalPanel`. Not a path like `externalTerminalCommand`: it's typed straight into the
   * PTY, so it can carry arguments (`claude --resume`). Optional: this postdates the first version
   * of `externalTools`, and an old snapshot legitimately has none of it. */
  agentLaunchCommand?: string
}

export interface NotificationSettings {
  enabled: boolean
  notifyOnFetch: boolean
  notifyOnPull: boolean
  notifyOnPush: boolean
  enableSound: boolean
  soundName?: string
  /** Gates both terminal PR states: merged and closed-without-merging. */
  notifyOnPrMerged?: boolean
  /** Auto-merge armed on a PR ("merge when ready" / merge queue). */
  notifyOnPrQueued?: boolean
  notifyOnReviewRequested?: boolean
  notifyOnReviewStatusChanged?: boolean
  notifyOnNewPr?: boolean
  /** Gates both CI outcomes: checks going green and checks failing. */
  notifyOnCi?: boolean
  /** A command in the integrated terminal (e.g. a coding agent) finished running — see
   * `NotchTerminalActivity`. */
  notifyOnTerminalFinished?: boolean
  /**
   * How a notification is presented — and, as a consequence, *how many* the app raises.
   *
   * `notch` is the app's own card, anchored at the top of the display where a MacBook's camera
   * housing is. It queues, updates in place and dismisses itself, so it can carry things a banner
   * cannot: live progress on a long operation, a git hook running, a background task finishing.
   *
   * `native` is the standard OS banner. It is one immutable line that lands in Notification
   * Centre, so it only gets the key discrete events — anything live or ambient is dropped rather
   * than turned into a stream of banners.
   *
   * `notch` still falls back to `native` on its own whenever the card can't be shown (no tray
   * rect, window creation failure), under the same filter; this setting is the user asking for the
   * banner, not the automatic fallback.
   */
  displayStyle?: NotificationDisplayStyle
  /** How long the `notch` style stays on screen before dismissing itself, in milliseconds.
   * `0` means it stays until the user closes it (or clicks away). Does not apply to `native`,
   * whose lifetime belongs to Notification Centre. */
  displayDurationMs?: number
}

/** `'popover'` was the previous spelling of `'notch'`; see `migrateDisplayStyle` in the app. */
export type NotificationDisplayStyle = 'notch' | 'native'

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
  /** Integrated terminal background colour (hex). Defaults to black. Per-repo overridable via
   * `RepoScopedSettings.terminalBackground`. */
  terminalBackground: string
  /** Integrated terminal text/foreground colour (hex). Per-repo overridable. */
  terminalForeground: string
  /** How translucent a glass-family theme renders, 0 (opaque) to 100 (most
   * see-through). Ignored by every opaque theme. Exists because the right value is
   * not knowable from here: it depends on the user's wallpaper and on how much the
   * native material already lightens it, so a fixed default is either invisible on
   * one desktop or unreadable on another. */
  glassTransparency?: number
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
