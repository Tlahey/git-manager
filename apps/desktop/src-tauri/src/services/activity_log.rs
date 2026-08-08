//! On-disk persistence for the frontend activity log.
//!
//! The frontend captures every IPC round-trip (already redacted/truncated) and keeps only the most
//! recent entries in memory; it streams them here to be appended to a rotating on-disk log so a full
//! week of activity survives restarts. Layout: one JSON Lines file per calendar day under
//! `~/.git-manager/activity-logs/` (`activity-YYYY-MM-DD.jsonl`), and files older than a week are
//! pruned on every append. Entries are persisted verbatim as `serde_json::Value` so the log format
//! can evolve frontend-side without a matching change here.

use crate::error::AppError;
use chrono::{Local, NaiveDate};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

const RETENTION_DAYS: i64 = 7;
const FILE_SUFFIX: &str = ".jsonl";

/// Which rotating log a batch belongs to.
///
/// Two directories rather than one file, because the two logs differ in every dimension that
/// matters: an activity entry is a few hundred bytes of already-truncated IPC arguments and there
/// are thousands a day, while an AI transcript is kilobytes of prompt and answer and there are
/// dozens. Merging them would bury the signal in whichever one you came looking for, and put the
/// user's source code into the log they routinely export for unrelated debugging.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogKind {
    /// Every IPC round-trip, redacted and truncated frontend-side.
    Activity,
    /// One AI call: its prompts and the model's answer, in full.
    AiTranscript,
}

impl LogKind {
    fn dir_name(self) -> &'static str {
        match self {
            LogKind::Activity => "activity-logs",
            LogKind::AiTranscript => "ai-logs",
        }
    }

    fn file_prefix(self) -> &'static str {
        match self {
            LogKind::Activity => "activity-",
            LogKind::AiTranscript => "ai-",
        }
    }
}

fn logs_dir(kind: LogKind) -> Option<PathBuf> {
    crate::utils::app_data_dir().map(|dir| dir.join(kind.dir_name()))
}

/// Appends a batch of activity entries to today's log file, then prunes files past the retention
/// window. Returns `Ok(())` for an empty batch without touching the disk.
pub fn append(kind: LogKind, entries: &[serde_json::Value]) -> Result<(), AppError> {
    if entries.is_empty() {
        return Ok(());
    }

    let dir = logs_dir(kind)
        .ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))?;
    fs::create_dir_all(&dir)?;

    let today = Local::now().date_naive();
    let prefix = kind.file_prefix();
    let path = dir.join(format!("{prefix}{today}{FILE_SUFFIX}"));

    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    let mut buf = String::new();
    for entry in entries {
        // One compact JSON object per line (JSONL): appendable and trivially streamable later.
        buf.push_str(&serde_json::to_string(entry).unwrap_or_else(|_| "{}".into()));
        buf.push('\n');
    }
    file.write_all(buf.as_bytes())?;

    prune_old(&dir, today, kind.file_prefix());
    Ok(())
}

/// Reads back the most recent entries of a rotating log, newest first.
///
/// The mirror of [`append`], and the only way a **second window** can see the activity log at all:
/// the in-memory buffer lives in the JS context that captured it, so the "Behind the scenes" window
/// (its own `WebviewWindow`, hence its own context) has no access to the main window's store. Disk is
/// the shared surface, and it is the durable one — a week of actions survives a restart.
///
/// Walks the day files newest-first and each file's lines bottom-up, stopping as soon as
/// `max_entries` are in hand, so reading the last fifty actions never costs a week of parsing.
/// Unparsable lines are skipped rather than failing the read: a log truncated mid-write by a crash is
/// exactly when this view is worth having.
pub fn read_recent(kind: LogKind, max_entries: usize) -> Result<Vec<serde_json::Value>, AppError> {
    if max_entries == 0 {
        return Ok(Vec::new());
    }

    let dir = logs_dir(kind)
        .ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))?;
    // A brand-new install has written nothing yet — an empty log is not an error.
    let Ok(dir_entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };

    let mut days: Vec<(NaiveDate, PathBuf)> = dir_entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            file_date(&path, kind.file_prefix()).map(|date| (date, path))
        })
        .collect();
    days.sort_by_key(|(date, _)| std::cmp::Reverse(*date));

    let mut out: Vec<serde_json::Value> = Vec::new();
    for (_, path) in days {
        let Ok(contents) = fs::read_to_string(&path) else {
            continue;
        };
        out.extend(tail_json_lines(&contents, max_entries - out.len()));
        if out.len() >= max_entries {
            break;
        }
    }
    Ok(out)
}

/// The last `max` parsable JSON objects of a JSONL body, newest (last written) first.
///
/// Split out from [`read_recent`] because it is the part with the two off-by-one risks worth a test —
/// the reversal and the cap — while the rest is directory IO.
fn tail_json_lines(contents: &str, max: usize) -> Vec<serde_json::Value> {
    contents
        .lines()
        .rev()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .take(max)
        .collect()
}

/// Reveals the activity-logs directory in the macOS Finder, creating it first if needed so the
/// reveal always lands somewhere real (a brand-new install may not have written a log yet).
pub fn open_dir(kind: LogKind) -> Result<(), AppError> {
    let dir = logs_dir(kind)
        .ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))?;
    fs::create_dir_all(&dir)?;
    Command::new("open").arg(&dir).spawn()?;
    Ok(())
}

/// Removes any `activity-YYYY-MM-DD.jsonl` file whose date is older than the retention window.
/// Best-effort: unreadable directory entries and failed deletes are ignored.
fn prune_old(dir: &Path, today: NaiveDate, prefix: &str) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(date) = file_date(&path, prefix) else {
            continue;
        };
        if is_expired(date, today, RETENTION_DAYS) {
            let _ = fs::remove_file(&path);
        }
    }
}

/// Parses the calendar date out of an `activity-YYYY-MM-DD.jsonl` path, or `None` for anything else.
fn file_date(path: &Path, prefix: &str) -> Option<NaiveDate> {
    let name = path.file_name().and_then(|n| n.to_str())?;
    let date_str = name.strip_prefix(prefix)?.strip_suffix(FILE_SUFFIX)?;
    NaiveDate::parse_from_str(date_str, "%Y-%m-%d").ok()
}

/// A file dated `file_date` is expired once it is strictly more than `retention_days` before `today`.
fn is_expired(file_date: NaiveDate, today: NaiveDate, retention_days: i64) -> bool {
    (today - file_date).num_days() > retention_days
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_files_within_the_retention_window() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 22).unwrap();
        // Today and up to a week ago are kept.
        assert!(!is_expired(today, today, RETENTION_DAYS));
        assert!(!is_expired(
            NaiveDate::from_ymd_opt(2026, 7, 15).unwrap(),
            today,
            RETENTION_DAYS
        ));
        // Eight days ago is past the window.
        assert!(is_expired(
            NaiveDate::from_ymd_opt(2026, 7, 14).unwrap(),
            today,
            RETENTION_DAYS
        ));
    }

    #[test]
    fn tails_json_lines_newest_first_and_capped() {
        let body = "{\"id\":\"1\"}\n{\"id\":\"2\"}\n{\"id\":\"3\"}\n";
        let tail = tail_json_lines(body, 2);
        assert_eq!(tail.len(), 2);
        assert_eq!(tail[0]["id"], "3");
        assert_eq!(tail[1]["id"], "2");
        // Asking for more than the file holds yields everything, not an error.
        assert_eq!(tail_json_lines(body, 10).len(), 3);
    }

    #[test]
    fn tailing_skips_blank_and_corrupted_lines() {
        // A log truncated mid-write by a crash is exactly when this read matters, so a broken line
        // must cost that line and nothing else.
        let body = "{\"id\":\"1\"}\n\n{\"id\":\"tru\n{\"id\":\"2\"}\n";
        let tail = tail_json_lines(body, 10);
        assert_eq!(tail.len(), 2);
        assert_eq!(tail[0]["id"], "2");
        assert_eq!(tail[1]["id"], "1");
    }

    #[test]
    fn parses_only_well_formed_log_filenames() {
        assert_eq!(
            file_date(Path::new("/x/activity-2026-07-22.jsonl"), "activity-"),
            NaiveDate::from_ymd_opt(2026, 7, 22)
        );
        assert!(file_date(Path::new("/x/activity-nope.jsonl"), "activity-").is_none());
        assert!(file_date(Path::new("/x/other-2026-07-22.jsonl"), "activity-").is_none());
    }
}
