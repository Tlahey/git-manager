//! Detects whether an AI coding agent (Claude Code today) is actively working inside a given
//! worktree, purely from the agent's on-disk session logs — no cooperation from the agent itself.
//!
//! Claude Code stores each session as a `.jsonl` transcript under
//! `~/.claude/projects/<slug>/`, where `<slug>` is the worktree's absolute path with every `/`
//! and `.` replaced by `-` (e.g. `/Users/x/Workspace/repo/.claude/worktrees/foo` →
//! `-Users-x-Workspace-repo--claude-worktrees-foo`). Claude appends to the active session's file
//! as it streams output and runs tools, so the *mtime of the most recently touched transcript* is
//! a good live proxy for "is the agent doing something right now":
//!
//! - written within [`WORKING_WINDOW_SECS`] → `working` (actively producing output),
//! - written within [`PRESENCE_WINDOW_SECS`] → `idle` (a session is open but quiet — likely
//!   awaiting input),
//! - older, or no session at all → no activity (the worktree is omitted from the result).
//!
//! This is deliberately a heuristic: there is no live "I am processing" flag on disk, and long
//! tool executions or model thinking can leave a >[`WORKING_WINDOW_SECS`] gap between writes, so
//! the `working` state can briefly flip to `idle` mid-turn. The window is sized to tolerate normal
//! streaming/tool gaps while still clearing shortly after the agent truly stops.

use crate::models::WorktreeAgentActivity;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// A transcript touched within this many seconds counts as the agent actively working. Sized to
/// absorb ordinary streaming/tool-execution gaps without flickering, while still clearing soon
/// after the agent stops.
const WORKING_WINDOW_SECS: u64 = 60;

/// A transcript touched within this many seconds (but outside [`WORKING_WINDOW_SECS`]) counts as a
/// quiet-but-present session — surfaced as `idle`. Beyond this the session is treated as stale and
/// the worktree reports no activity.
const PRESENCE_WINDOW_SECS: u64 = 15 * 60;

/// The agent id reported for Claude Code sessions. Kept as a plain string in the DTO so more
/// detectors (other agents) can be added without a breaking enum change on the wire.
const AGENT_CLAUDE: &str = "claude";

/// Maps a worktree's absolute path to Claude Code's project-directory slug: every `/` and `.`
/// becomes `-`. Matches the directory names under `~/.claude/projects/`.
fn claude_project_slug(worktree_path: &str) -> String {
    worktree_path
        .chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect()
}

/// `~/.claude/projects` — the root holding one slug directory per project/worktree Claude Code has
/// opened. `None` if no home directory can be resolved.
fn claude_projects_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .filter(|h| !h.is_empty())?;
    Some(Path::new(&home).join(".claude").join("projects"))
}

/// Seconds elapsed since `mtime`, or `None` if the timestamp is in the future / unreadable (clock
/// skew) — treated by the caller as "no usable signal".
fn seconds_since(now: SystemTime, mtime: SystemTime) -> Option<u64> {
    now.duration_since(mtime).ok().map(|d| d.as_secs())
}

/// Newest `.jsonl` transcript mtime in `dir`, as seconds-since-epoch, or `None` if the directory
/// is missing or holds no transcripts.
fn newest_transcript_mtime(dir: &Path) -> Option<SystemTime> {
    let entries = fs::read_dir(dir).ok()?;
    let mut newest: Option<SystemTime> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(mtime) = entry.metadata().and_then(|m| m.modified()) else {
            continue;
        };
        if newest.is_none_or(|cur| mtime > cur) {
            newest = Some(mtime);
        }
    }
    newest
}

/// Resolves the current activity for a single worktree from its Claude session directory, or `None`
/// when there's no recent session to report.
fn activity_for_worktree(
    projects_root: &Path,
    now: SystemTime,
    worktree_path: &str,
) -> Option<WorktreeAgentActivity> {
    let dir = projects_root.join(claude_project_slug(worktree_path));
    let mtime = newest_transcript_mtime(&dir)?;
    let elapsed = seconds_since(now, mtime)?;

    let state = if elapsed <= WORKING_WINDOW_SECS {
        "working"
    } else if elapsed <= PRESENCE_WINDOW_SECS {
        "idle"
    } else {
        return None;
    };

    let last_activity_ms = mtime
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    Some(WorktreeAgentActivity {
        path: worktree_path.to_string(),
        agent: AGENT_CLAUDE.to_string(),
        state: state.to_string(),
        last_activity_ms,
    })
}

/// Detects agent activity for each of `worktree_paths`, returning one entry per worktree that has a
/// recent Claude session (quiet worktrees are simply absent). Never errors: a missing home dir or
/// unreadable session directory just yields an empty result, since this only drives an optional UI
/// hint.
pub fn detect_agent_activity(worktree_paths: &[String]) -> Vec<WorktreeAgentActivity> {
    let Some(projects_root) = claude_projects_root() else {
        return Vec::new();
    };
    let now = SystemTime::now();
    worktree_paths
        .iter()
        .filter_map(|path| activity_for_worktree(&projects_root, now, path))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::time::Duration;

    #[test]
    fn slug_replaces_slashes_and_dots() {
        assert_eq!(
            claude_project_slug("/Users/x/Workspace/repo/.claude/worktrees/foo"),
            "-Users-x-Workspace-repo--claude-worktrees-foo"
        );
    }

    #[test]
    fn newest_transcript_ignores_non_jsonl_and_picks_latest() {
        let dir = std::env::temp_dir().join(format!("agent-session-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        File::create(dir.join("a.jsonl")).unwrap();
        File::create(dir.join("notes.txt")).unwrap();
        // Only the .jsonl should be considered; a lone transcript is trivially the newest.
        let newest = newest_transcript_mtime(&dir);
        assert!(newest.is_some());
        // A directory with no transcripts yields None.
        let empty =
            std::env::temp_dir().join(format!("agent-session-empty-{}", std::process::id()));
        fs::create_dir_all(&empty).unwrap();
        assert!(newest_transcript_mtime(&empty).is_none());
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&empty).ok();
    }

    #[test]
    fn state_buckets_by_elapsed_window() {
        // Build a projects root with one slugged dir holding a fresh transcript, then sample `now`
        // AFTER writing so the file's mtime isn't in the future (which would read as no signal).
        let root = std::env::temp_dir().join(format!("agent-session-root-{}", std::process::id()));
        let worktree = "/tmp/wt/example";
        let slug_dir = root.join(claude_project_slug(worktree));
        fs::create_dir_all(&slug_dir).unwrap();
        File::create(slug_dir.join("s.jsonl")).unwrap();
        let now = SystemTime::now();

        let fresh = activity_for_worktree(&root, now, worktree).expect("fresh session");
        assert_eq!(fresh.state, "working");
        assert_eq!(fresh.agent, "claude");
        assert_eq!(fresh.path, worktree);

        // A `now` far in the future makes the same file look stale → no activity.
        let future = now + Duration::from_secs(PRESENCE_WINDOW_SECS + 120);
        assert!(activity_for_worktree(&root, future, worktree).is_none());

        // Within the presence window but past the working window → idle.
        let later = now + Duration::from_secs(WORKING_WINDOW_SECS + 30);
        assert_eq!(
            activity_for_worktree(&root, later, worktree).unwrap().state,
            "idle"
        );

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn unknown_worktree_reports_no_activity() {
        let root = std::env::temp_dir().join(format!("agent-session-none-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        assert!(activity_for_worktree(&root, SystemTime::now(), "/nope/here").is_none());
        fs::remove_dir_all(&root).ok();
    }
}
