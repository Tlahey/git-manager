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
const DIR_NAME: &str = "activity-logs";
const FILE_PREFIX: &str = "activity-";
const FILE_SUFFIX: &str = ".jsonl";

fn logs_dir() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok().map(PathBuf::from).or_else(|| {
        #[allow(deprecated)]
        std::env::home_dir()
    })?;
    Some(home.join(".git-manager").join(DIR_NAME))
}

/// Appends a batch of activity entries to today's log file, then prunes files past the retention
/// window. Returns `Ok(())` for an empty batch without touching the disk.
pub fn append(entries: &[serde_json::Value]) -> Result<(), AppError> {
    if entries.is_empty() {
        return Ok(());
    }

    let dir =
        logs_dir().ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))?;
    fs::create_dir_all(&dir)?;

    let today = Local::now().date_naive();
    let path = dir.join(format!("{FILE_PREFIX}{today}{FILE_SUFFIX}"));

    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    let mut buf = String::new();
    for entry in entries {
        // One compact JSON object per line (JSONL): appendable and trivially streamable later.
        buf.push_str(&serde_json::to_string(entry).unwrap_or_else(|_| "{}".into()));
        buf.push('\n');
    }
    file.write_all(buf.as_bytes())?;

    prune_old(&dir, today);
    Ok(())
}

/// Reveals the activity-logs directory in the macOS Finder, creating it first if needed so the
/// reveal always lands somewhere real (a brand-new install may not have written a log yet).
pub fn open_dir() -> Result<(), AppError> {
    let dir =
        logs_dir().ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))?;
    fs::create_dir_all(&dir)?;
    Command::new("open").arg(&dir).spawn()?;
    Ok(())
}

/// Removes any `activity-YYYY-MM-DD.jsonl` file whose date is older than the retention window.
/// Best-effort: unreadable directory entries and failed deletes are ignored.
fn prune_old(dir: &Path, today: NaiveDate) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(date) = file_date(&path) else {
            continue;
        };
        if is_expired(date, today, RETENTION_DAYS) {
            let _ = fs::remove_file(&path);
        }
    }
}

/// Parses the calendar date out of an `activity-YYYY-MM-DD.jsonl` path, or `None` for anything else.
fn file_date(path: &Path) -> Option<NaiveDate> {
    let name = path.file_name().and_then(|n| n.to_str())?;
    let date_str = name.strip_prefix(FILE_PREFIX)?.strip_suffix(FILE_SUFFIX)?;
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
    fn parses_only_well_formed_log_filenames() {
        assert_eq!(
            file_date(Path::new("/x/activity-2026-07-22.jsonl")),
            NaiveDate::from_ymd_opt(2026, 7, 22)
        );
        assert!(file_date(Path::new("/x/activity-nope.jsonl")).is_none());
        assert!(file_date(Path::new("/x/other-2026-07-22.jsonl")).is_none());
    }
}
