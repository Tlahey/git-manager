//! Reads the user's shell history for `git …` commands, for the rewards/gamification feature.
//! Filesystem-driven only — no `git2` — kept apart from the repo lifecycle commands in `repo.rs`.

use crate::error::AppError;

/// The history files read, in the order they are reported.
const HISTORY_FILES: [&str; 2] = [".zsh_history", ".bash_history"];

/// How many of each file's most recent git commands are reported, so the payload can't grow with the
/// history. Per file, deliberately: a cap over the two files merged could drop a live `.zsh_history`
/// entirely behind a long, stale `.bash_history`.
const MAX_HISTORY_COMMANDS: usize = 100;

/// One shell history file's `git …` command lines.
///
/// **Per file, never merged into one list.** The frontend spots the commands the user just ran by
/// diffing a read against the previous one, which only works on an append-only stream
/// (`lib/rewards/terminalHistory.ts`). Concatenating the two files broke that invariant in a way no
/// type could catch: a command appended to the live `.zsh_history` landed in the *middle* of the
/// merged list — before the `.bash_history` block — so it read as a rewritten history rather than as
/// something new, and the user was never credited for it.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalHistorySource {
    /// The file's name, e.g. `.zsh_history` — the key the frontend tracks its snapshot under.
    pub source: String,
    /// Its `git …` lines, oldest first, consecutive duplicates dropped, newest 100 kept.
    pub commands: Vec<String>,
}

/// Extracts the `git …` command lines from one shell history file, oldest first.
///
/// Lenient by design: a missing or unreadable file, or non-UTF-8 content, yields no commands rather
/// than an error — this feeds a gamification panel, and no reward is worth failing a read over.
fn read_git_history(path: &std::path::Path) -> Vec<String> {
    use std::fs::File;
    use std::io::Read;

    let Ok(mut file) = File::open(path) else {
        return Vec::new();
    };
    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return Vec::new();
    }

    let content = String::from_utf8_lossy(&bytes);
    let mut commands = Vec::new();
    for line in content.lines() {
        // zsh's EXTENDED_HISTORY writes `: <epoch>:<elapsed>;<command>`; bash writes the line as is.
        let cmd = if line.starts_with(':') {
            match line.find(';') {
                Some(pos) => &line[pos + 1..],
                None => line,
            }
        } else {
            line
        };
        let trimmed = cmd.trim();
        if trimmed.starts_with("git ") {
            commands.push(trimmed.to_string());
        }
    }

    // Drop consecutive duplicates
    commands.dedup();

    if commands.len() > MAX_HISTORY_COMMANDS {
        commands = commands.split_off(commands.len() - MAX_HISTORY_COMMANDS);
    }
    commands
}

/// Reads the system's zsh/bash history and extracts the commands starting with `git`, one entry per
/// history file (see `TerminalHistorySource` for why they are not merged). Files that are missing,
/// unreadable or hold no git command are simply absent from the result.
#[tauri::command]
pub async fn get_terminal_commands() -> Result<Vec<TerminalHistorySource>, String> {
    let home = std::env::var("HOME")
        .ok()
        .or_else(|| {
            #[allow(deprecated)]
            std::env::home_dir().map(|p| p.to_string_lossy().to_string())
        })
        .ok_or_else(|| {
            String::from(AppError::Unknown(
                "Could not find home directory".to_string(),
            ))
        })?;

    let home_path = std::path::Path::new(&home);
    Ok(HISTORY_FILES
        .iter()
        .map(|name| TerminalHistorySource {
            source: (*name).to_string(),
            commands: read_git_history(&home_path.join(name)),
        })
        .filter(|source| !source.commands.is_empty())
        .collect())
}
