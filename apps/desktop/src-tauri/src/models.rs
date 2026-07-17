use serde::{Deserialize, Serialize};

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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitGraphNode {
    pub commit: GitCommit,
    pub column: usize,
    pub color: String,
    pub connections: Vec<GitGraphEdge>,
    pub refs: Vec<GitRef>,
}

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

// ─── Refs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitRef {
    pub name: String,
    pub short_name: String,
    pub ref_type: String, // "branch" | "tag" | "remote" | "HEAD"
    pub commit_oid: String,
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

// ─── Rebase ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStep {
    pub action: String, // pick | reword | edit | squash | fixup | drop
    pub oid: String,
    pub message: String,
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
}

// ─── Conflict Resolution (3-way merge editor) ─────────────────────────────────
// Miroir exact de MergeBlockKind / MergeBlock / ThreeWayMergeView dans packages/git-types.

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
}

// ─── Diff ─────────────────────────────────────────────────────────────────────
// Miroir exact de GitDiff / GitDiffFile / GitDiffHunk / GitDiffLine dans
// packages/git-types. Source unique — ne pas redéfinir ces structs localement
// dans commands/commit.rs ou commands/log.rs.

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
