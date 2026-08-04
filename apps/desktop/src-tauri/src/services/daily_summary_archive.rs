//! On-disk archive for the AI daily summaries.
//!
//! Each morning's briefing is written as a **markdown file**, not a row in a store: the point of
//! keeping two months of them is that the user can open one in their editor, grep the folder, or
//! keep it after uninstalling the app. Layout mirrors `activity_log.rs` — one file per calendar day,
//! pruned on every write — but grouped per repository:
//!
//! ```text
//! ~/.git-manager/summaries/<repo-slug>/YYYY-MM-DD.md
//! ```
//!
//! `<repo-slug>` is the repository's directory name plus a short hash of its absolute path, because
//! two checkouts of the same project (a worktree, a second clone) share a directory name and must
//! not share an archive.
//!
//! Optionally the same markdown is also written **inside the repository** (`.git-manager/summaries/`)
//! so the archive travels with the project. That is opt-in: untracked files in a git client's own
//! repos are a visible regression, so when it is enabled the writer registers `.git-manager/` in
//! `.git/info/exclude` — the local, never-committed ignore file — rather than touching the project's
//! own `.gitignore`.
//!
//! The file is the source of truth; the frontend store is a cache of it. Parsing therefore lives
//! here too: the front matter is a flat `key: value` block, deliberately simple enough to read
//! without a YAML crate, and the body is left as opaque markdown for the frontend to render.

use crate::error::AppError;
use crate::utils::repo_slug;
use chrono::{Local, NaiveDate};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// How long an archived briefing is kept. Two months is the window the user browses and searches;
/// past that a summary is neither remembered nor useful, and keeping it forever would turn a
/// grep-able folder into a landfill.
const RETENTION_DAYS: i64 = 60;

const FILE_SUFFIX: &str = ".md";
/// Directory written inside the repository when the in-repo copy is enabled, and the entry added to
/// `.git/info/exclude` so it never shows up as an untracked change.
const IN_REPO_DIR: &str = ".git-manager";

/// One archived briefing as it exists on disk. `markdown` is the whole file (front matter included)
/// so the frontend owns the rendering and can re-parse it with its own tolerant parser.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredSummaryFile {
    /// Absolute path of the repository the briefing is about, read back from the front matter.
    pub repo_path: String,
    /// The repository's display name, read back from the front matter.
    pub repo_name: String,
    /// The day the briefing covers, `YYYY-MM-DD`.
    pub date: String,
    /// Absolute path of the markdown file itself — what "open in editor" and "delete" act on.
    pub file_path: String,
    pub markdown: String,
}

fn summaries_root() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok().map(PathBuf::from).or_else(|| {
        #[allow(deprecated)]
        std::env::home_dir()
    })?;
    Some(home.join(".git-manager").join("summaries"))
}

/// Reads one `key: value` out of the leading `---` front-matter block. Returns `None` when the file
/// has no front matter or the key is absent, so a hand-edited file degrades instead of erroring.
fn front_matter_value(markdown: &str, key: &str) -> Option<String> {
    let rest = markdown.strip_prefix("---\n")?;
    let end = rest.find("\n---")?;
    rest[..end]
        .lines()
        .find_map(|line| line.split_once(':').filter(|(k, _)| k.trim() == key))
        .map(|(_, value)| value.trim().to_string())
}

/// Writes today's briefing for one repository, then prunes anything past the retention window.
///
/// `date` is supplied by the caller (the frontend owns the local clock, exactly as it does for the
/// summary window itself) and is used verbatim as the filename, so a regenerated day overwrites
/// rather than accumulating. Returns the path of the archive copy.
pub fn write_summary(
    repo_path: &str,
    date: &str,
    markdown: &str,
    also_in_repo: bool,
) -> Result<String, AppError> {
    let root = summaries_root()
        .ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))?;
    let dir = root.join(repo_slug(repo_path));
    fs::create_dir_all(&dir)?;

    let path = dir.join(format!("{date}{FILE_SUFFIX}"));
    fs::write(&path, markdown)?;

    if also_in_repo {
        // Best-effort: the archive copy is the one that must succeed. A read-only checkout or a
        // bare repo shouldn't fail the morning run.
        let _ = write_in_repo_copy(repo_path, date, markdown);
    }

    prune_old(&dir, Local::now().date_naive());
    Ok(path.to_string_lossy().to_string())
}

/// Writes the optional in-repository copy and makes sure git ignores it locally.
fn write_in_repo_copy(repo_path: &str, date: &str, markdown: &str) -> Result<(), AppError> {
    let dir = Path::new(repo_path).join(IN_REPO_DIR).join("summaries");
    fs::create_dir_all(&dir)?;
    fs::write(dir.join(format!("{date}{FILE_SUFFIX}")), markdown)?;
    ensure_locally_excluded(repo_path);
    prune_old(&dir, Local::now().date_naive());
    Ok(())
}

/// Adds `.git-manager/` to `.git/info/exclude` if it isn't already there.
///
/// `info/exclude` rather than `.gitignore` on purpose: it is local to the clone and never committed,
/// so enabling a convenience feature in this app cannot produce a diff in the user's project.
fn ensure_locally_excluded(repo_path: &str) {
    let info_dir = Path::new(repo_path).join(".git").join("info");
    // A linked worktree's `.git` is a file, not a directory — no `info/` to write to, and its
    // exclude file lives in the main repo anyway. Skipping is correct, not a failure.
    if !info_dir.exists() && fs::create_dir_all(&info_dir).is_err() {
        return;
    }
    let exclude = info_dir.join("exclude");
    let current = fs::read_to_string(&exclude).unwrap_or_default();
    let entry = format!("{IN_REPO_DIR}/");
    if current.lines().any(|line| line.trim() == entry) {
        return;
    }
    let separator = if current.is_empty() || current.ends_with('\n') {
        ""
    } else {
        "\n"
    };
    let _ = fs::write(
        &exclude,
        format!(
            "{current}{separator}# Added by git-manager: local daily-summary archive\n{entry}\n"
        ),
    );
}

/// Reads every archived briefing across every repository, newest day first.
///
/// The whole corpus is at most two months of short markdown files, so it is read in one pass and
/// filtered frontend-side — paginating a few hundred kilobytes of text would add a protocol for no
/// gain. Unreadable files are skipped rather than failing the listing.
pub fn list_summaries() -> Result<Vec<StoredSummaryFile>, AppError> {
    let root = summaries_root()
        .ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))?;
    let Ok(repo_dirs) = fs::read_dir(&root) else {
        // No archive yet: an empty list, not an error.
        return Ok(Vec::new());
    };

    let mut summaries = Vec::new();
    for repo_dir in repo_dirs.flatten() {
        let Ok(files) = fs::read_dir(repo_dir.path()) else {
            continue;
        };
        for file in files.flatten() {
            let path = file.path();
            let Some(date) = file_date(&path) else {
                continue;
            };
            let Ok(markdown) = fs::read_to_string(&path) else {
                continue;
            };
            summaries.push(StoredSummaryFile {
                repo_path: front_matter_value(&markdown, "repoPath").unwrap_or_default(),
                repo_name: front_matter_value(&markdown, "repo").unwrap_or_default(),
                date: date.format("%Y-%m-%d").to_string(),
                file_path: path.to_string_lossy().to_string(),
                markdown,
            });
        }
    }

    // Newest first, repositories alphabetical within a day — the order the timeline renders in.
    summaries.sort_by(|a, b| {
        b.date
            .cmp(&a.date)
            .then_with(|| a.repo_name.cmp(&b.repo_name))
    });
    Ok(summaries)
}

/// Deletes one archived briefing. Refuses paths outside the archive root so a bad argument can't
/// turn this into an arbitrary-file delete.
pub fn delete_summary(file_path: &str) -> Result<(), AppError> {
    let root = summaries_root()
        .ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))?;
    let path = PathBuf::from(file_path);
    if !path.starts_with(&root) {
        return Err(AppError::InvalidInput(
            "Refusing to delete a file outside the summaries archive".to_string(),
        ));
    }
    fs::remove_file(&path)?;
    Ok(())
}

/// Reveals the archive directory in the Finder, creating it first so the reveal always lands
/// somewhere real.
pub fn open_dir() -> Result<(), AppError> {
    let root = summaries_root()
        .ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))?;
    fs::create_dir_all(&root)?;
    Command::new("open").arg(&root).spawn()?;
    Ok(())
}

/// Removes any `YYYY-MM-DD.md` whose date is older than the retention window. Best-effort:
/// unreadable entries and failed deletes are ignored.
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

/// Parses the calendar date out of a `YYYY-MM-DD.md` path, or `None` for anything else.
fn file_date(path: &Path) -> Option<NaiveDate> {
    let name = path.file_name().and_then(|n| n.to_str())?;
    NaiveDate::parse_from_str(name.strip_suffix(FILE_SUFFIX)?, "%Y-%m-%d").ok()
}

/// A file dated `file_date` is expired once it is strictly more than `retention_days` before `today`.
fn is_expired(file_date: NaiveDate, today: NaiveDate, retention_days: i64) -> bool {
    (today - file_date).num_days() > retention_days
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str =
        "---\nrepo: git-manager\nrepoPath: /tmp/git-manager\ndate: 2026-07-27\n---\n\n# Hello\n";

    #[test]
    fn keeps_files_within_the_retention_window() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 27).unwrap();
        assert!(!is_expired(today, today, RETENTION_DAYS));
        assert!(!is_expired(
            NaiveDate::from_ymd_opt(2026, 5, 28).unwrap(),
            today,
            RETENTION_DAYS
        ));
        // 61 days back is past the window.
        assert!(is_expired(
            NaiveDate::from_ymd_opt(2026, 5, 27).unwrap(),
            today,
            RETENTION_DAYS
        ));
    }

    #[test]
    fn parses_only_well_formed_summary_filenames() {
        assert_eq!(
            file_date(Path::new("/x/2026-07-27.md")),
            NaiveDate::from_ymd_opt(2026, 7, 27)
        );
        assert!(file_date(Path::new("/x/notes.md")).is_none());
        assert!(file_date(Path::new("/x/2026-07-27.txt")).is_none());
    }

    #[test]
    fn reads_flat_front_matter_keys() {
        assert_eq!(
            front_matter_value(SAMPLE, "repo").as_deref(),
            Some("git-manager")
        );
        assert_eq!(
            front_matter_value(SAMPLE, "repoPath").as_deref(),
            Some("/tmp/git-manager")
        );
        assert!(front_matter_value(SAMPLE, "missing").is_none());
        assert!(front_matter_value("# no front matter\n", "repo").is_none());
    }

    #[test]
    fn delete_refuses_paths_outside_the_archive() {
        let err = delete_summary("/etc/passwd").unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[test]
    fn adds_the_exclude_entry_once() {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-archive-exclude-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(dir.join(".git").join("info")).unwrap();
        let repo_path = dir.to_str().unwrap();

        ensure_locally_excluded(repo_path);
        ensure_locally_excluded(repo_path);

        let exclude = fs::read_to_string(dir.join(".git").join("info").join("exclude")).unwrap();
        assert_eq!(
            exclude
                .lines()
                .filter(|l| l.trim() == ".git-manager/")
                .count(),
            1
        );
        fs::remove_dir_all(&dir).ok();
    }
}
