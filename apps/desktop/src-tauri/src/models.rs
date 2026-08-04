use serde::{Deserialize, Deserializer, Serialize};
use std::collections::BTreeMap;

// ─── Themes ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserTheme {
    pub id: String,
    pub name: String,
    pub css: String,
}

// ─── Repository ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitRepo {
    pub path: String,
    pub name: String,
    pub head: String,
    pub is_detached: bool,
    pub is_dirty: bool,
    pub remotes: Vec<String>,
    /// Path of the main worktree that owns this repo. Equal to `path` for a normal repo/main
    /// worktree; for a linked worktree it's the owning repository's main worktree, so the frontend
    /// can scope per-repo settings to the repo instead of each worktree.
    pub main_worktree_path: String,
}

// ─── Signatures / Commits ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitSignature {
    pub name: String,
    pub email: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub oid: String,
    pub short_oid: String,
    pub message: String,
    pub subject: String,
    pub body: String,
    pub author: GitSignature,
    pub committer: GitSignature,
    pub parent_oids: Vec<String>,
}

// ─── Graph ────────────────────────────────────────────────────────────────────

// The graph *node* lives in `services/git_graph.rs` as `LogGraphNode`, next to the layout algorithm
// that builds it, and carries `LogRef` — a ref whose type field serializes as `type`, which is what
// the frontend reads. A second pair here could only drift out of step with it.

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitGraphEdge {
    pub from_column: usize,
    pub to_column: usize,
    pub color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dashed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starts_at_node: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ends_at_node: Option<bool>,
}

// ─── Branches ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub short_name: String,
    pub is_head: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub commit_oid: String,
    pub commit_message: String,
    pub commit_timestamp: i64,
    pub ahead_count: usize,
    pub behind_count: usize,
}

// ─── Status ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub staged: Vec<GitStatusEntry>,
    pub unstaged: Vec<GitStatusEntry>,
    pub untracked: Vec<String>,
    pub conflicted: Vec<String>,
}

// ─── Stash ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStash {
    pub index: usize,
    pub message: String,
    pub branch: String,
    pub commit_oid: String,
    pub timestamp: i64,
    pub files_count: usize,
    pub additions: usize,
    pub deletions: usize,
}

// ─── Worktree ─────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktree {
    pub path: String,
    pub branch: String,
    pub commit_oid: String,
    pub is_main: bool,
    pub is_locked: bool,
    pub is_dirty: bool,
    pub is_prunable: bool,
    pub locked_reason: Option<String>,
}

/// Outcome of `add_worktree` once optional default-file copying has run: which repo-relative
/// files were copied into the new worktree, and which configured glob patterns matched nothing.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeAddResult {
    pub copied: Vec<String>,
    pub skipped: Vec<String>,
}

// ─── Agent activity ─────────────────────────────────────────────────────────────

/// Live signal that an AI coding agent (Claude Code today) is running inside a worktree, derived
/// from the agent's on-disk session logs. See `services/agent_session.rs`.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeAgentActivity {
    /// Absolute path of the worktree the agent is working in.
    pub path: String,
    /// Which agent is active — `"claude"` today (the only detector implemented). A plain string so
    /// more agents can be added without a breaking wire change.
    pub agent: String,
    /// `"working"` when the session log was touched within the freshness window (the agent is
    /// actively producing output), or `"idle"` when a session exists but is quiet (likely awaiting
    /// input).
    pub state: String,
    /// Epoch-millis mtime of the most recently touched session log for this worktree.
    pub last_activity_ms: i64,
}

// ─── Rebase ───────────────────────────────────────────────────────────────────

/// One command of a *running* rebase's todo list, as reconstructed by
/// `services/git_rebase_plan.rs` — what the rebase progress view draws its rail from. Unlike
/// `RebaseTodoStep` (`services/git_interactive_rebase.rs`), which is a plan the UI submits, this
/// describes work git is already executing.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RebaseProgressStep {
    /// 1-based position in the plan, in execution order (oldest first).
    pub index: usize,
    /// Todo command, always in long form: `pick` | `reword` | `edit` | `squash` | `fixup` |
    /// `drop` | `exec` | `break` | `label` | `reset` | `merge` | `update-ref`.
    pub action: String,
    /// Commit being replayed. `None` for commands that don't take one (`exec`, `break`…).
    pub oid: Option<String>,
    pub short_oid: Option<String>,
    /// Commit subject, or the command's argument text for non-commit commands.
    pub subject: Option<String>,
    /// `done` | `current` | `pending` — `current` is the step the rebase is paused on.
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RebaseState {
    pub kind: String, // idle | in_progress | conflict | edit_pause
    pub current_step: Option<usize>,
    pub total_steps: Option<usize>,
    pub current_oid: Option<String>,
    pub conflicted_files: Option<Vec<String>>,
    pub branch_name: Option<String>,
    /// Original message of the commit currently being replayed (looked up via `current_oid`),
    /// used to prefill the conflict-resolution panel's commit message box.
    pub current_message: Option<String>,
    /// The whole todo list in execution order — empty when idle, or for the am backend, which
    /// keeps no todo file. Drives the rebase progress view's "where am I" rail.
    pub steps: Vec<RebaseProgressStep>,
    /// Commit the branch is being replayed onto (`.git/rebase-merge/onto`), with its subject
    /// and the name of a ref pointing at it (e.g. `main`) when there is one.
    pub onto_oid: Option<String>,
    pub onto_short_oid: Option<String>,
    pub onto_subject: Option<String>,
    pub onto_label: Option<String>,
}

/// State of a `git bisect` session, mirrored by `BisectState` in packages/git-types.
///
/// Read directly from git's on-disk plumbing (`.git/BISECT_*` files + `refs/bisect/*`) the same
/// way `RebaseState` reads `.git/rebase-merge` — libgit2 has no bisect API. `revsRemaining` /
/// `stepsRemaining` come from `git rev-list --bisect-vars`, and `firstBadOid` is set once the
/// search resolves (the `# first bad commit:` line git appends to `BISECT_LOG`).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BisectState {
    /// Whether a bisect session is in progress (`.git/BISECT_START` exists).
    pub active: bool,
    /// Branch the bisect was started from (`.git/BISECT_START`), restored on `bisect reset`.
    pub start_branch: Option<String>,
    /// Bisect terms — normally "bad"/"good", but a session can use custom terms.
    pub bad_term: String,
    pub good_term: String,
    /// The known-bad commit (`refs/bisect/bad`).
    pub bad_oid: Option<String>,
    /// The known-good commits (`refs/bisect/good-*`).
    pub good_oids: Vec<String>,
    /// Commits explicitly skipped (`refs/bisect/skip-*`).
    pub skipped_oids: Vec<String>,
    /// The commit currently checked out for testing (detached HEAD during a bisect).
    pub current_oid: Option<String>,
    pub current_summary: Option<String>,
    pub current_author: Option<String>,
    /// Remaining search space, from `git rev-list --bisect-vars` (`bisect_nr` / `bisect_steps`).
    pub revs_remaining: Option<u32>,
    pub steps_remaining: Option<u32>,
    /// Set once the search resolves: the first bad commit and its subject.
    pub first_bad_oid: Option<String>,
    pub first_bad_summary: Option<String>,
}

// ─── Conflict Resolution (3-way merge editor) ─────────────────────────────────
// Exact mirror of MergeBlockKind / MergeBlock / ThreeWayMergeView in packages/git-types.

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MergeBlockKind {
    Unchanged,
    OursOnly,
    TheirsOnly,
    BothSame,
    BothDifferent,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeBlock {
    pub block_id: usize,
    pub kind: MergeBlockKind,
    pub ours_start_line: usize, // 1-based
    pub ours_line_count: usize,
    pub theirs_start_line: usize, // 1-based
    pub theirs_line_count: usize,
    pub ours_lines: Vec<String>,
    pub theirs_lines: Vec<String>,
    pub base_lines: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ThreeWayMergeView {
    pub file_path: String,
    pub renderable: bool,
    pub is_binary: bool,
    pub conflict_kind: Option<String>, // "delete" | "rename"
    pub blocks: Vec<MergeBlock>,
    pub ours_text: String,
    pub theirs_text: String,
    pub conflict_count: usize, // count of BothDifferent blocks only
}

// ─── AI provider ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderStatus {
    pub connected: bool,
    pub models: Vec<String>,
    pub version: Option<String>,
    /// Why a check failed, as a short technical diagnostic (the exact URL that was probed plus the
    /// HTTP status or transport error). Settings shows it verbatim: "not connected" alone leaves
    /// the user guessing between a wrong port, a missing `/v1` and an unparseable response.
    pub detail: Option<String>,
}

// ─── Diff ─────────────────────────────────────────────────────────────────────
// Exact mirror of GitDiff / GitDiffFile / GitDiffHunk / GitDiffLine in
// packages/git-types. Single source — do not redefine these structs locally
// in commands/commit.rs or commands/log.rs.

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffLine {
    pub origin: String,
    pub content: String,
    pub old_lineno: Option<i32>,
    pub new_lineno: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffHunk {
    pub header: String,
    pub lines: Vec<GitDiffLine>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffFile {
    pub old_path: String,
    pub new_path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub hunks: Vec<GitDiffHunk>,
    pub is_binary: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub files: Vec<GitDiffFile>,
    pub total_additions: usize,
    pub total_deletions: usize,
}

// ─── Repo Summary ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoSummary {
    pub path: String,
    pub name: String,
    pub head: String,
    pub is_detached: bool,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    pub conflicted_count: usize,
    pub ahead_count: usize,
    pub behind_count: usize,
}

// ─── Board (Kanban) ───────────────────────────────────────────────────────────

/// Which backend produced a [`Board`]. Always `"local"` here — the local backend is the only one
/// with a Rust representation; the remote (GitHub-backed) board is built entirely client-side from
/// `.git-manager/board.json` + issues/labels and never round-trips through this struct.
pub const LOCAL_BOARD_SOURCE: &str = "local";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoardColumn {
    pub id: String,
    pub name: String,
    pub order: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Whether landing in this column means the work is finished — drives sprint statistics and
    /// which cards carry over when a sprint is closed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_done: Option<bool>,
}

/// One tag in a board's palette. Cards reference these by id rather than carrying free-form strings,
/// so a given tag is the same colour on every card of the board.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoardTag {
    pub id: String,
    pub name: String,
    /// CSS colour as `#rrggbb`.
    pub color: String,
}

/// One message in a card's discussion. Append-only — [`BoardCardPatch`] deliberately cannot touch
/// these, so editing a card can never rewrite what someone else wrote.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoardComment {
    pub id: String,
    /// Taken from the repo's git `user.name` here rather than from the frontend, so a comment's
    /// author is whoever the repository says is committing.
    pub author: String,
    /// Markdown.
    pub body: String,
    pub created_at: String,
}

/// A sprint's outcome, frozen onto the board when it is closed. Computed in TypeScript
/// (`app/board/sprintStats.ts`) and passed in, so the arithmetic lives once rather than being
/// duplicated in both languages — this struct only has to store it faithfully.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SprintSummary {
    pub closed_at: String,
    pub total_cards: u32,
    pub done_cards: u32,
    pub unfinished_cards: u32,
    pub completion_rate: u32,
    pub blocked_cards: u32,
    pub overdue_cards: u32,
    pub by_column: Vec<SprintSummaryColumn>,
    pub by_priority: Vec<SprintSummaryPriority>,
    pub by_assignee: Vec<SprintSummaryAssignee>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub carried_over_to_board_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SprintSummaryColumn {
    pub column_id: String,
    pub column_name: String,
    pub count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SprintSummaryPriority {
    pub priority: String,
    pub count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SprintSummaryAssignee {
    pub assignee: String,
    pub total: u32,
    pub done: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub name: String,
    pub source: String, // always `LOCAL_BOARD_SOURCE` for this struct — see its doc comment
    pub columns: Vec<BoardColumn>,
    /// Optimistic-concurrency token: the board ref's tip commit oid at the time this was read (see
    /// `services::git_board`'s module doc comment). Every `BoardCard` read alongside a `Board` carries
    /// the same value — this is a whole-board version stamp, not tracked per card.
    pub revision: String,
    /// The board's tag palette.
    #[serde(default)]
    pub tags: Vec<BoardTag>,
    /// Legacy single prefix, kept only so a board written before per-card prefixes existed can be
    /// migrated on read — see `migrate_prefixes`. Never written again.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub card_prefix: String,
    /// Legacy single counter, same story as `card_prefix`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_card_number: Option<u32>,
    /// The prefixes this board knows about — what the create dialog offers, in the order they were
    /// added. A card picks one at creation; adding a new one here is part of that same write.
    #[serde(default)]
    pub card_prefixes: Vec<String>,
    /// The number the next card will take, **per prefix**: `GM` and `BUG` each run their own
    /// sequence, so one is never left with holes because the other was used in between.
    ///
    /// A stored counter rather than `max(existing) + 1`: deleting the newest card must not hand its
    /// number to the next one, or two different tickets end up having been `GM-7`. A `BTreeMap` so
    /// the serialized board is byte-stable — this is committed to a git ref, and a map that
    /// reordered itself would produce a diff on every write.
    #[serde(default)]
    pub next_card_numbers: BTreeMap<String, u32>,
    /// Markdown task list copied into every new card's `dod`. Empty when the board doesn't want one.
    #[serde(default)]
    pub dod_template: String,
    /// Set when the sprint was closed; a closed board is read-only in the UI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<String>,
    /// Statistics frozen at closing time. Stored rather than recomputed because closing a sprint
    /// *moves* its unfinished cards to the successor board — recomputing later would report a sprint
    /// that went better than it actually did.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<SprintSummary>,
    pub schema_version: u32,
    pub created_at: String,
    pub updated_at: String,
}

/// The GitHub issue a card on a *local* board tracks.
///
/// Its presence changes where the card's content lives: the issue becomes the source of truth for
/// everything GitHub can hold, and this ref is the only part the local board stores — alongside the
/// placement (`column_id`, `order`), which has no GitHub-native home and so stays local. The backend
/// only persists the ref; fetching and merging the issue is the frontend's job (`trackedIssue.api`),
/// because the backend makes no network calls.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BoardCardSourceIssue {
    pub owner: String,
    pub repo: String,
    pub number: u64,
}

/// One declared relationship between two cards.
///
/// **Stored on one side only.** The inverse (`blocks` ⇄ `blockedBy`, `contains` ⇄ `partOf`) is
/// derived when the other card is displayed, never written — two stored halves are two things that
/// can disagree, and a half-deleted link is a bug with no natural repair. `relates` is its own
/// inverse.
///
/// `target_board_id` is carried because a card can move to another board and its links must survive
/// that; a link whose target sits on a board that isn't loaded renders as the board's name rather
/// than resolving to a card.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BoardCardLink {
    pub target_board_id: String,
    pub target_card_id: String,
    /// `"relates"` | `"blocks"` | `"contains"`. Only the forward halves are storable, so the set of
    /// representable links is exactly the set of meaningful ones.
    pub kind: String,
}

/// What a new card *is*, as opposed to where it goes.
///
/// Grouped into a struct rather than passed as five more parameters: the column is the placement and
/// everything here is the card's own identity, and the two kept drifting apart as fields were added.
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewBoardCard {
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// Which identifier sequence to draw this card's number from. Empty means an unnumbered card.
    #[serde(default)]
    pub prefix: String,
    #[serde(default = "default_card_kind")]
    pub kind: String,
    /// Set to track a GitHub issue from the card's very first commit.
    #[serde(default)]
    pub source_issue: Option<BoardCardSourceIssue>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoardCard {
    pub id: String,
    pub board_id: String,
    pub column_id: String,
    pub title: String,
    pub description: String,
    pub order: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_branch: Option<String>,
    /// Optimistic-concurrency token — see `Board::revision`. Sent back on every update so a write
    /// racing another one is rejected (`AppError::BoardConflict`) instead of silently overwriting it.
    pub revision: String,
    /// The card's own identifier prefix — `"GM"` renders this card as `GM-7`. The card's, not the
    /// board's: that is what lets it keep its identifier when it moves to another board.
    #[serde(default)]
    pub prefix: String,
    /// The card's number within its **prefix**. Allocated from the board's counter for that prefix
    /// at creation; `0` for cards written before identifiers existed.
    #[serde(default)]
    pub number: u32,
    /// `"task"` | `"bug"` | `"epic"`. A `String` rather than an enum for the same reason as
    /// `priority`: a card written by a future version carrying an unknown kind still deserializes
    /// instead of failing the whole board read.
    #[serde(default = "default_card_kind")]
    pub kind: String,
    /// Links this card declares to others — see `BoardCardLink`.
    #[serde(default)]
    pub links: Vec<BoardCardLink>,
    /// Set when the card was archived — hidden from the columns but kept, and findable by searching.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    /// Set when this card tracks a GitHub issue — see `BoardCardSourceIssue`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_issue: Option<BoardCardSourceIssue>,
    /// The single person responsible. Free text here — a local repository has no user directory to
    /// pick from (the remote backend uses the issue's native GitHub assignee instead).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assignee: Option<String>,
    /// `"high"` | `"normal"` | `"low"`. A `String` rather than an enum so a card blob written by a
    /// future version carrying an unknown priority still deserializes instead of failing the whole
    /// board read.
    #[serde(default = "default_priority")]
    pub priority: String,
    /// `YYYY-MM-DD`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    /// Ids into the owning board's `tags` palette.
    #[serde(default)]
    pub tag_ids: Vec<String>,
    /// Why this card is stuck. **Its presence is the blocked flag** — there is no separate boolean,
    /// so "blocked with no stated reason" is unrepresentable rather than merely discouraged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocked_reason: Option<String>,
    /// Definition of Done as a markdown task list, seeded from the board's template at creation and
    /// freely editable per card afterwards.
    #[serde(default)]
    pub dod: String,
    #[serde(default)]
    pub comments: Vec<BoardComment>,
    pub schema_version: u32,
    pub updated_at: String,
}

/// Cards written before priorities existed have no `priority` key; they are normal-priority.
fn default_priority() -> String {
    "normal".to_string()
}

/// Cards written before Task/Bug/Epic existed are tasks.
fn default_card_kind() -> String {
    "task".to_string()
}

/// Makes `Option<Option<T>>` mean what a patch needs it to mean.
///
/// serde's own `Option` deserializer turns a JSON `null` straight into `None`, so the outer and inner
/// `None` collapse: "key absent" and "key set to null" become indistinguishable, and every *clear
/// this field* patch is silently dropped. Wrapping the result in `Some` restores the third state, so
/// absent stays `None` (leave it) and `null` becomes `Some(None)` (clear it).
///
/// It only works together with `#[serde(default)]`, which is what supplies the outer `None` when the
/// key isn't there at all.
fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

#[cfg(test)]
mod double_option_probe {
    use super::BoardCardPatch;

    /// Pins the behaviour the "unchanged vs cleared" encoding depends on: a JSON `null` must arrive
    /// as `Some(None)` (clear it), and an absent key as `None` (leave it alone).
    ///
    /// serde does **not** do this on its own — `Option<Option<T>>` collapses `null` to `None`, which
    /// made every "clear this field" patch a silent no-op. Hence `deserialize_with`.
    #[test]
    fn a_json_null_means_clear_and_an_absent_key_means_unchanged() {
        let absent: BoardCardPatch = serde_json::from_str("{}").unwrap();
        assert_eq!(absent.due_date, None);

        let cleared: BoardCardPatch = serde_json::from_str(r#"{"dueDate":null}"#).unwrap();
        assert_eq!(cleared.due_date, Some(None));

        let set: BoardCardPatch = serde_json::from_str(r#"{"dueDate":"2026-08-10"}"#).unwrap();
        assert_eq!(set.due_date, Some(Some("2026-08-10".to_string())));
    }

    #[test]
    fn the_same_holds_for_every_clearable_field() {
        let patch: BoardCardPatch =
            serde_json::from_str(r#"{"linkedBranch":null,"assignee":null,"blockedReason":null}"#)
                .unwrap();
        assert_eq!(patch.linked_branch, Some(None));
        assert_eq!(patch.assignee, Some(None));
        assert_eq!(patch.blocked_reason, Some(None));
    }
}

/// Patch applied by `update_card`/`move_card` — every field left `None` is left unchanged.
#[derive(Debug, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BoardCardPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub column_id: Option<String>,
    pub order: Option<u32>,
    /// Distinguishes "leave unchanged" (absent) from "clear the link" (`Some(None)`) — a plain
    /// `Option<String>` can't express that, since `null` and "key absent" would collapse together.
    /// The `deserialize_with` is what actually keeps them apart; see `double_option`.
    #[serde(default, deserialize_with = "double_option")]
    pub linked_branch: Option<Option<String>>,
    /// Same double-`Option` "unchanged vs cleared" encoding as `linked_branch` above.
    #[serde(default, deserialize_with = "double_option")]
    pub assignee: Option<Option<String>>,
    pub priority: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub due_date: Option<Option<String>>,
    pub tag_ids: Option<Vec<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub blocked_reason: Option<Option<String>>,
    pub dod: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub archived_at: Option<Option<String>>,
    /// Starts or stops tracking a GitHub issue. `null` untracks — the card keeps the content it was
    /// last showing and becomes an ordinary local card, rather than vanishing with the link.
    #[serde(default, deserialize_with = "double_option")]
    pub source_issue: Option<Option<BoardCardSourceIssue>>,
    /// `"task"` | `"bug"` | `"epic"`.
    pub kind: Option<String>,
    /// The card's whole link list, replaced wholesale. Adding and removing one link each go through
    /// here rather than through their own commands: a link list is small, and a read-modify-write of
    /// the whole thing under the board's existing revision check is simpler to reason about than two
    /// more mutations with their own conflict semantics.
    pub links: Option<Vec<BoardCardLink>>,
}
