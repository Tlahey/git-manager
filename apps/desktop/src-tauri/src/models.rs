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
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub connected: bool,
    pub models: Vec<String>,
    pub version: Option<String>,
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
