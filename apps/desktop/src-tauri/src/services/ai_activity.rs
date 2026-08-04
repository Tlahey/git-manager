//! Git-activity gathering for the AI "daily summary" feature. Where `ai_context.rs` snapshots the
//! *uncommitted* changes for commit-writing features, this module looks *backwards*: it collects the
//! commits authored within a recent time window (what was done "yesterday") plus a light snapshot of
//! the still-uncommitted work (a hint for what could be planned "today"). Same division of labour as
//! the rest of the AI plumbing — the git2 logic lives here, while the instruction, prompt shape and
//! response parsing all live in `@git-manager/ai`; the backend never knows the context is for a
//! summary.
//!
//! The window is taken over the repo's **main branch**, not HEAD: a briefing about "what landed
//! yesterday" that silently described whichever feature branch happened to be checked out would be
//! answering a different question every morning. The branch is resolved from the same ordered
//! candidate list the merge-target indicator uses (`origin/main`, `origin/master`, …) via
//! [`resolve_first_ref`], falling back to HEAD when none of them exists so a repo with no remote is
//! still summarizable.
//!
//! Alongside the commits, the walk reports the two ends of the window as raw oids (`base_oid` /
//! `head_oid`). That is what lets the caller ask `ai_context.rs` for the day's *diff* through the
//! existing `Range` scope instead of needing a second bespoke diff path here.

use crate::error::AppError;
use crate::services::git_ref_resolve::resolve_first_ref;
use crate::utils::short_oid;
use git2::{Delta, DiffOptions, Repository};
use serde::Serialize;
use std::path::Path;

/// Hard cap on the number of commits fed to the model, so an unusually busy window can't blow up the
/// prompt. Newest commits win — older ones beyond the cap are dropped.
const MAX_COMMITS: usize = 50;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCommit {
    pub short_oid: String,
    pub subject: String,
    /// The commit body (message minus the subject line), trimmed. Empty when the commit is
    /// subject-only.
    pub body: String,
    pub author: String,
    /// Author timestamp, seconds since the epoch — lets the frontend/model reason about ordering.
    pub timestamp: i64,
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingChange {
    pub path: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiActivity {
    pub repo_name: String,
    /// The branch the window was taken over: the resolved main-branch candidate (`origin/main`), or
    /// the checked-out branch's name when no candidate existed.
    pub branch: String,
    /// Non-merge commits authored within the requested window, newest first (capped at
    /// [`MAX_COMMITS`]).
    pub commits: Vec<ActivityCommit>,
    /// A light snapshot of the uncommitted work (staged + unstaged + untracked), so the summary can
    /// suggest what's still in flight / what to plan next. May be empty on a clean tree.
    pub pending: Vec<PendingChange>,
    /// True when the window contained more non-merge commits than [`MAX_COMMITS`], so the frontend
    /// can note the summary is based on a sample.
    pub truncated: bool,
    /// The commit the window starts *from* — the first parent of the oldest in-window commit, or
    /// that commit itself when it is a root commit. Paired with [`Self::head_oid`] it is the range
    /// the day's diff is taken over. `None` when the window held no commits.
    pub base_oid: Option<String>,
    /// The tip the window ends at: the newest in-window commit. `None` when the window held no
    /// commits.
    pub head_oid: Option<String>,
}

fn status_word(delta: Delta) -> &'static str {
    match delta {
        Delta::Added => "added",
        Delta::Deleted => "deleted",
        Delta::Modified => "modified",
        Delta::Renamed => "renamed",
        Delta::Copied => "copied",
        Delta::Untracked => "untracked",
        Delta::Typechange => "typechange",
        _ => "modified",
    }
}

/// Computes `(files_changed, insertions, deletions)` for a commit versus its first parent (or the
/// empty tree for a root commit). Returns zeros if the diff can't be produced — stats are advisory.
fn commit_stats(repo: &Repository, commit: &git2::Commit) -> (usize, usize, usize) {
    let commit_tree = match commit.tree() {
        Ok(t) => t,
        Err(_) => return (0, 0, 0),
    };
    let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None);
    match diff.and_then(|d| d.stats()) {
        Ok(stats) => (stats.files_changed(), stats.insertions(), stats.deletions()),
        Err(_) => (0, 0, 0),
    }
}

/// Collects the uncommitted changes (worktree vs HEAD, untracked included) as a flat file list.
fn collect_pending(repo: &Repository) -> Vec<PendingChange> {
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut opts = DiffOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let Ok(diff) = repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts)) else {
        return Vec::new();
    };
    let mut pending = Vec::new();
    for delta in diff.deltas() {
        if let Some(path) = delta.new_file().path().or_else(|| delta.old_file().path()) {
            pending.push(PendingChange {
                path: path.to_string_lossy().to_string(),
                status: status_word(delta.status()).to_string(),
            });
        }
    }
    pending
}

/// The commits found in a window, plus the two ends of the range they span.
struct CommitWindow {
    commits: Vec<ActivityCommit>,
    truncated: bool,
    /// First parent of the oldest collected commit (or that commit itself when it is a root), so
    /// `base_oid..head_oid` is exactly the set of commits in `commits`.
    base_oid: Option<String>,
    head_oid: Option<String>,
}

/// Walks `tip`'s history newest-first and gathers every non-merge commit authored within
/// `[since_epoch, until_epoch]`.
///
/// Both ends are needed because the window is now a **calendar day**, not "the last N hours": the
/// walk starts at the branch tip, which is usually far newer than the day being asked about, so
/// anything past `until_epoch` is skipped rather than collected. Falling before `since_epoch` ends
/// the walk — history is time-ordered, so there is nothing newer left to find.
///
/// Merge commits are skipped: their auto-generated subjects don't describe authored work.
fn collect_commits(
    repo: &Repository,
    tip: git2::Oid,
    since_epoch: i64,
    until_epoch: i64,
) -> Result<CommitWindow, AppError> {
    let mut revwalk = repo.revwalk().map_err(AppError::Git)?;
    revwalk
        .set_sorting(git2::Sort::TIME)
        .map_err(AppError::Git)?;
    if revwalk.push(tip).is_err() {
        // Unreachable tip (unborn branch) — no history to summarize.
        return Ok(CommitWindow {
            commits: Vec::new(),
            truncated: false,
            base_oid: None,
            head_oid: None,
        });
    }

    let mut commits = Vec::new();
    let mut truncated = false;
    let mut base_oid = None;
    let mut head_oid = None;
    for oid in revwalk {
        let Ok(oid) = oid else { continue };
        let Ok(commit) = repo.find_commit(oid) else {
            continue;
        };
        // Author time drives "when the work was done"; a rebase can rewrite committer time later.
        let authored_at = commit.author().when().seconds();
        if authored_at < since_epoch {
            break;
        }
        // Newer than the day asked about: skip, don't stop. The walk begins at the branch tip, so
        // every commit made since that day is passed through on the way down to it.
        if authored_at > until_epoch {
            continue;
        }
        if commit.parent_count() > 1 {
            continue;
        }
        if commits.len() >= MAX_COMMITS {
            truncated = true;
            break;
        }
        let raw_message = commit.message().unwrap_or("");
        let subject = raw_message.lines().next().unwrap_or("").trim().to_string();
        let body = raw_message
            .lines()
            .skip(2)
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
        let (files_changed, insertions, deletions) = commit_stats(repo, &commit);
        // The first accepted commit is the newest (the range's head); the last one to be accepted
        // is the oldest, and its parent is where the range starts. Keeping the *collected* oldest
        // rather than the window's true oldest is what makes the diff match `commits` even when the
        // walk stopped early at [`MAX_COMMITS`].
        head_oid.get_or_insert_with(|| commit.id().to_string());
        base_oid = Some(commit.parent_id(0).unwrap_or(commit.id()).to_string());
        commits.push(ActivityCommit {
            short_oid: short_oid(&commit.id().to_string()),
            subject,
            body,
            author: commit.author().name().unwrap_or("").to_string(),
            timestamp: commit.author().when().seconds(),
            files_changed,
            insertions,
            deletions,
        });
    }
    Ok(CommitWindow {
        commits,
        truncated,
        base_oid,
        head_oid,
    })
}

/// Gathers the activity context for the daily-summary feature: the non-merge commits authored on the
/// main branch within `[since_epoch, until_epoch]`, plus the current uncommitted work.
///
/// The bounds are absolute epoch seconds supplied by the caller rather than a duration, because the
/// window is one **local calendar day** and only the frontend knows the user's clock and time zone —
/// the same division of labour that already put "what counts as yesterday" in TypeScript. This stays
/// a pure git query.
///
/// `candidates` is the ordered main-branch list (`origin/main`, `origin/master`, …); when none of
/// them resolves the walk falls back to HEAD, so a repo with no remote still produces a briefing
/// about its own history.
pub fn build_ai_activity(
    repo_path: &str,
    since_epoch: i64,
    until_epoch: i64,
    candidates: &[String],
) -> Result<AiActivity, AppError> {
    let repo =
        Repository::open(repo_path).map_err(|_| AppError::RepoNotFound(repo_path.to_string()))?;

    // The branch the briefing is *about*. Falling back to HEAD keeps remote-less repos working, and
    // reporting the name we actually walked means the prompt never claims the wrong branch.
    // No fallback to HEAD. A briefing reports what was **merged into the default branch**, and HEAD
    // is usually a feature branch whose commits have landed nowhere — summarizing it would quietly
    // answer a different question, and the reader has no way to tell which one they got. When no
    // candidate resolves there is simply nothing to report; the caller renders "nothing to
    // summarize" and the resolved branch name is empty rather than a misleading one.
    let (branch, tip) = match resolve_first_ref(&repo, candidates) {
        Some((name, commit)) => (name, Some(commit.id())),
        None => (String::new(), None),
    };

    let window = match tip {
        Some(tip) => collect_commits(&repo, tip, since_epoch, until_epoch)?,
        None => CommitWindow {
            commits: Vec::new(),
            truncated: false,
            base_oid: None,
            head_oid: None,
        },
    };
    let pending = collect_pending(&repo);

    let repo_name = Path::new(repo_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| repo_path.to_string());

    Ok(AiActivity {
        repo_name,
        branch,
        commits: window.commits,
        pending,
        truncated: window.truncated,
        base_oid: window.base_oid,
        head_oid: window.head_oid,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{Oid, Signature, Time};

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-aiact-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn now_epoch() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }

    /// The window "from `hours` ago until now", as absolute bounds.
    fn last_hours(hours: i64) -> (i64, i64) {
        let now = now_epoch();
        (now - hours * 3600, now)
    }

    /// Commits `files` onto `reference` with an author time of `age_hours` ago, so a test can place
    /// a commit inside or outside the window without sleeping.
    fn commit_at(
        repo: &Repository,
        reference: &str,
        msg: &str,
        files: &[(&str, &str)],
        age_hours: i64,
        parents: &[Oid],
    ) -> Oid {
        let when = Time::new(now_epoch() - age_hours * 3600, 0);
        let sig = Signature::new("Tester", "tester@example.com", &when).unwrap();
        let mut tb = repo.treebuilder(None).unwrap();
        for (name, content) in files {
            let blob = repo.blob(content.as_bytes()).unwrap();
            tb.insert(name, blob, 0o100644).unwrap();
        }
        let tree = repo.find_tree(tb.write().unwrap()).unwrap();
        let parent_commits: Vec<git2::Commit> = parents
            .iter()
            .map(|p| repo.find_commit(*p).unwrap())
            .collect();
        let parent_refs: Vec<&git2::Commit> = parent_commits.iter().collect();
        repo.commit(Some(reference), &sig, &sig, msg, &tree, &parent_refs)
            .unwrap()
    }

    #[test]
    fn window_excludes_commits_older_than_the_cutoff() {
        let dir = temp_dir("window");
        let repo = Repository::init(&dir).unwrap();
        let old = commit_at(
            &repo,
            "refs/heads/main",
            "old work",
            &[("a.txt", "a")],
            100,
            &[],
        );
        commit_at(
            &repo,
            "refs/heads/main",
            "recent work",
            &[("a.txt", "a"), ("b.txt", "b")],
            2,
            &[old],
        );

        let (since, until) = last_hours(24);
        let activity =
            build_ai_activity(dir.to_str().unwrap(), since, until, &["main".into()]).unwrap();
        assert_eq!(
            activity
                .commits
                .iter()
                .map(|c| c.subject.as_str())
                .collect::<Vec<_>>(),
            vec!["recent work"]
        );
        // The range starts at the excluded commit, so its diff holds only the recent change.
        assert_eq!(activity.base_oid, Some(old.to_string()));
        assert!(activity.head_oid.is_some());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_empty_window_reports_no_commits_and_no_range() {
        let dir = temp_dir("empty");
        let repo = Repository::init(&dir).unwrap();
        commit_at(
            &repo,
            "refs/heads/main",
            "old work",
            &[("a.txt", "a")],
            100,
            &[],
        );

        let (since, until) = last_hours(24);
        let activity =
            build_ai_activity(dir.to_str().unwrap(), since, until, &["main".into()]).unwrap();
        assert!(activity.commits.is_empty());
        assert!(activity.base_oid.is_none());
        assert!(activity.head_oid.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// A root commit has no parent, so the range has to start at the commit itself rather than
    /// producing `None` and losing the day's only work.
    fn root_only_window(name: &str) -> (std::path::PathBuf, Oid) {
        let dir = temp_dir(name);
        let repo = Repository::init(&dir).unwrap();
        let root = commit_at(
            &repo,
            "refs/heads/main",
            "first ever",
            &[("a.txt", "a")],
            2,
            &[],
        );
        (dir, root)
    }

    #[test]
    fn a_root_commit_is_its_own_range_base() {
        let (dir, root) = root_only_window("root");
        let (since, until) = last_hours(24);
        let activity =
            build_ai_activity(dir.to_str().unwrap(), since, until, &["main".into()]).unwrap();
        assert_eq!(activity.base_oid, Some(root.to_string()));
        assert_eq!(activity.head_oid, Some(root.to_string()));
        std::fs::remove_dir_all(&dir).ok();
    }

    /// The whole point of the candidate list: HEAD sits on a feature branch, but the briefing must
    /// describe `main`.
    #[test]
    fn the_window_follows_the_main_branch_not_head() {
        let dir = temp_dir("main-branch");
        let repo = Repository::init(&dir).unwrap();
        let base = commit_at(&repo, "refs/heads/main", "init", &[("a.txt", "a")], 3, &[]);
        commit_at(
            &repo,
            "refs/heads/main",
            "landed on main",
            &[("a.txt", "aa")],
            2,
            &[base],
        );
        commit_at(
            &repo,
            "refs/heads/feature",
            "wip on feature",
            &[("a.txt", "a"), ("f.txt", "f")],
            1,
            &[base],
        );
        repo.set_head("refs/heads/feature").unwrap();

        let (since, until) = last_hours(24);
        let activity = build_ai_activity(
            dir.to_str().unwrap(),
            since,
            until,
            &["origin/main".into(), "main".into()],
        )
        .unwrap();
        assert_eq!(activity.branch, "main");
        assert_eq!(
            activity
                .commits
                .iter()
                .map(|c| c.subject.as_str())
                .collect::<Vec<_>>(),
            vec!["landed on main", "init"]
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    /// A briefing reports what was merged into the default branch. Falling back to HEAD would
    /// summarize an unmerged feature branch and answer a different question without saying so.
    #[test]
    fn reports_nothing_when_no_default_branch_resolves() {
        let dir = temp_dir("no-default");
        let repo = Repository::init(&dir).unwrap();
        commit_at(
            &repo,
            "refs/heads/solo",
            "unmerged work",
            &[("a.txt", "a")],
            2,
            &[],
        );
        repo.set_head("refs/heads/solo").unwrap();

        let (since, until) = last_hours(24);
        let activity =
            build_ai_activity(dir.to_str().unwrap(), since, until, &["origin/main".into()])
                .unwrap();
        assert_eq!(activity.branch, "");
        assert!(activity.commits.is_empty());
        assert!(activity.base_oid.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// Only commits *reachable from* the default branch count — an unmerged branch's work is
    /// invisible until the day it lands.
    #[test]
    fn ignores_commits_that_never_landed_on_the_default_branch() {
        let dir = temp_dir("unmerged");
        let repo = Repository::init(&dir).unwrap();
        let base = commit_at(&repo, "refs/heads/main", "init", &[("a.txt", "a")], 3, &[]);
        commit_at(
            &repo,
            "refs/heads/main",
            "landed on main",
            &[("a.txt", "aa")],
            2,
            &[base],
        );
        commit_at(
            &repo,
            "refs/heads/feature",
            "never merged",
            &[("a.txt", "a"), ("f.txt", "f")],
            2,
            &[base],
        );

        let (since, until) = last_hours(24);
        let activity =
            build_ai_activity(dir.to_str().unwrap(), since, until, &["main".into()]).unwrap();

        let subjects: Vec<&str> = activity
            .commits
            .iter()
            .map(|c| c.subject.as_str())
            .collect();
        assert!(subjects.contains(&"landed on main"));
        assert!(!subjects.contains(&"never merged"));
        std::fs::remove_dir_all(&dir).ok();
    }

    /// The window is one calendar day, and the walk starts at the branch tip — so everything
    /// committed *since* that day has to be skipped on the way down rather than ending the walk.
    #[test]
    fn window_excludes_commits_newer_than_the_upper_bound() {
        let dir = temp_dir("upper-bound");
        let repo = Repository::init(&dir).unwrap();
        let old = commit_at(
            &repo,
            "refs/heads/main",
            "day before",
            &[("a.txt", "a")],
            72,
            &[],
        );
        let target = commit_at(
            &repo,
            "refs/heads/main",
            "the day itself",
            &[("a.txt", "aa")],
            48,
            &[old],
        );
        commit_at(
            &repo,
            "refs/heads/main",
            "today",
            &[("a.txt", "aaa")],
            1,
            &[target],
        );

        // A window covering only the 48h-old commit: 60h ago → 36h ago.
        let now = now_epoch();
        let activity = build_ai_activity(
            dir.to_str().unwrap(),
            now - 60 * 3600,
            now - 36 * 3600,
            &["main".into()],
        )
        .unwrap();

        assert_eq!(
            activity
                .commits
                .iter()
                .map(|c| c.subject.as_str())
                .collect::<Vec<_>>(),
            vec!["the day itself"]
        );
        // The range spans exactly that commit, so its diff excludes both neighbours.
        assert_eq!(activity.base_oid, Some(old.to_string()));
        assert_eq!(activity.head_oid, Some(target.to_string()));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_day_with_no_commits_reports_an_empty_window() {
        let dir = temp_dir("quiet-day");
        let repo = Repository::init(&dir).unwrap();
        commit_at(&repo, "refs/heads/main", "today", &[("a.txt", "a")], 1, &[]);

        let now = now_epoch();
        let activity = build_ai_activity(
            dir.to_str().unwrap(),
            now - 60 * 3600,
            now - 36 * 3600,
            &["main".into()],
        )
        .unwrap();

        assert!(activity.commits.is_empty());
        assert!(activity.base_oid.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }
}
