use crate::models::WorktreeAgentActivity;
use crate::services::agent_session;

// ─── get_worktree_agent_activity ──────────────────────────────────────────────

/// Reports which of the given worktrees currently have an AI coding agent (Claude Code) working in
/// them, and whether it's actively producing output (`working`) or a session is merely open and
/// quiet (`idle`). Worktrees with no recent session are omitted. Derived from the agent's on-disk
/// session logs — see `services/agent_session.rs`. Never errors: an unreadable session store just
/// yields an empty list, since this only drives an optional UI hint.
#[tauri::command]
pub async fn get_worktree_agent_activity(
    paths: Vec<String>,
) -> Result<Vec<WorktreeAgentActivity>, String> {
    Ok(agent_session::detect_agent_activity(&paths))
}
