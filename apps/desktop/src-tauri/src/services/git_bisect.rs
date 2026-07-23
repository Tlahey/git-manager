//! Reads and interprets git's on-disk `git bisect` state.
//!
//! libgit2 has no bisect support, so — exactly like [`git_rebase`](super::git_rebase) does for
//! rebases — this reads git's own plumbing directly: the `.git/BISECT_*` files and the
//! `refs/bisect/*` refs git writes while a `git bisect` session is running. The mutating actions
//! (start / good / bad / skip / reset) shell out to the `git` binary from `commands::bisect`,
//! because reproducing git's bisection math (midpoint selection across merge topology, skips) in
//! git2 would be fragile. This module only *observes* the state that shell-out leaves behind.

use crate::error::AppError;
use crate::models::BisectState;
use git2::Repository;
use std::fs;
use std::path::Path;

/// Reads the repository's current bisect state from disk. `revs_remaining` / `steps_remaining`
/// are left `None` here — they need `git rev-list --bisect-vars`, which the command layer fills in
/// (it has the `git` binary available); see [`parse_bisect_vars`].
pub fn read_bisect_state(repo: &Repository) -> Result<BisectState, AppError> {
    let git_dir = repo.path();

    // A bisect is active iff git left its start marker on disk.
    if !git_dir.join("BISECT_START").exists() {
        return Ok(idle_state());
    }

    let start_branch = read_trimmed(&git_dir.join("BISECT_START"));
    let (bad_term, good_term) = read_terms(git_dir);

    let bad_oid = ref_target(repo, "refs/bisect/bad");
    let good_oids = glob_ref_targets(repo, "refs/bisect/good-*");
    let skipped_oids = glob_ref_targets(repo, "refs/bisect/skip-*");

    // During a bisect, HEAD is detached on the commit currently under test.
    let (current_oid, current_summary, current_author) = match repo
        .revparse_single("HEAD")
        .ok()
        .and_then(|obj| obj.peel_to_commit().ok())
    {
        Some(commit) => (
            Some(commit.id().to_string()),
            commit.summary().map(str::to_string),
            commit.author().name().map(str::to_string),
        ),
        None => (None, None, None),
    };

    let (first_bad_oid, first_bad_summary) = read_first_bad(git_dir);

    Ok(BisectState {
        active: true,
        start_branch,
        bad_term,
        good_term,
        bad_oid,
        good_oids,
        skipped_oids,
        current_oid,
        current_summary,
        current_author,
        revs_remaining: None,
        steps_remaining: None,
        first_bad_oid,
        first_bad_summary,
    })
}

/// Whether the pair forms a valid bisect range: `good` must be an ancestor of `bad` (the only
/// orientation `git bisect` accepts — the bug appeared somewhere between a known-good ancestor and a
/// newer known-bad descendant). Resolves both revisions first, so tags / SHAs / `HEAD` all work.
/// Returns `false` when the two are equal or unrelated (divergent branches), so the UI can block the
/// start with a clear message instead of letting `git bisect` fail mid-checkout.
pub fn is_valid_range(repo: &Repository, bad_rev: &str, good_rev: &str) -> Result<bool, AppError> {
    let bad = repo
        .revparse_single(bad_rev)
        .and_then(|o| o.peel_to_commit())
        .map_err(AppError::Git)?
        .id();
    let good = repo
        .revparse_single(good_rev)
        .and_then(|o| o.peel_to_commit())
        .map_err(AppError::Git)?
        .id();
    if bad == good {
        return Ok(false);
    }
    Ok(repo.graph_descendant_of(bad, good).unwrap_or(false))
}

/// Parses the output of `git rev-list --bisect-vars` into `(revs_remaining, steps_remaining)`.
///
/// The relevant lines are `bisect_nr=<N>` (revisions left to test after the current one) and
/// `bisect_steps=<M>` (estimated remaining steps). Values are quoted for `bisect_rev` only, so a
/// plain integer parse of the right-hand side is enough here.
pub fn parse_bisect_vars(stdout: &str) -> (Option<u32>, Option<u32>) {
    let mut revs = None;
    let mut steps = None;
    for line in stdout.lines() {
        if let Some(v) = line.strip_prefix("bisect_nr=") {
            revs = v.trim().parse().ok();
        } else if let Some(v) = line.strip_prefix("bisect_steps=") {
            steps = v.trim().parse().ok();
        }
    }
    (revs, steps)
}

fn idle_state() -> BisectState {
    BisectState {
        active: false,
        start_branch: None,
        bad_term: "bad".to_string(),
        good_term: "good".to_string(),
        bad_oid: None,
        good_oids: Vec::new(),
        skipped_oids: Vec::new(),
        current_oid: None,
        current_summary: None,
        current_author: None,
        revs_remaining: None,
        steps_remaining: None,
        first_bad_oid: None,
        first_bad_summary: None,
    }
}

/// Reads `.git/BISECT_TERMS` (line 1 = bad-side term, line 2 = good-side term), defaulting to the
/// standard "bad"/"good" when the file is absent (older git, or a not-yet-termed session).
fn read_terms(git_dir: &Path) -> (String, String) {
    let contents = read_trimmed(&git_dir.join("BISECT_TERMS")).unwrap_or_default();
    let mut lines = contents.lines();
    let bad = lines.next().filter(|s| !s.is_empty()).unwrap_or("bad");
    let good = lines.next().filter(|s| !s.is_empty()).unwrap_or("good");
    (bad.to_string(), good.to_string())
}

/// Extracts the resolved commit from the `# first bad commit: [<sha>] <subject>` line git appends
/// to `BISECT_LOG` once the search narrows to a single culprit. Returns `(oid, subject)`.
fn read_first_bad(git_dir: &Path) -> (Option<String>, Option<String>) {
    let Some(log) = read_trimmed(&git_dir.join("BISECT_LOG")) else {
        return (None, None);
    };
    let Some(line) = log
        .lines()
        .rev()
        .find(|l| l.starts_with("# first bad commit:"))
    else {
        return (None, None);
    };
    // Format: "# first bad commit: [<full-sha>] <subject>"
    let Some(open) = line.find('[') else {
        return (None, None);
    };
    let Some(close) = line[open..].find(']').map(|i| open + i) else {
        return (None, None);
    };
    let oid = line[open + 1..close].trim().to_string();
    let subject = line[close + 1..].trim();
    let subject = if subject.is_empty() {
        None
    } else {
        Some(subject.to_string())
    };
    (Some(oid), subject)
}

/// Resolves a single ref to its target OID string, or `None` if it doesn't exist.
fn ref_target(repo: &Repository, name: &str) -> Option<String> {
    repo.find_reference(name)
        .ok()
        .and_then(|r| r.target())
        .map(|oid| oid.to_string())
}

/// Resolves every ref matching a glob (e.g. `refs/bisect/good-*`) to its target OID string.
fn glob_ref_targets(repo: &Repository, glob: &str) -> Vec<String> {
    let Ok(refs) = repo.references_glob(glob) else {
        return Vec::new();
    };
    refs.filter_map(|r| r.ok())
        .filter_map(|r| r.target())
        .map(|oid| oid.to_string())
        .collect()
}

fn read_trimmed(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_bisect_vars_extracts_nr_and_steps() {
        let stdout = "bisect_rev='56b2cd9'\nbisect_nr=2\nbisect_good=2\nbisect_bad=1\nbisect_all=5\nbisect_steps=1\n";
        assert_eq!(parse_bisect_vars(stdout), (Some(2), Some(1)));
    }

    #[test]
    fn parse_bisect_vars_returns_none_when_absent() {
        assert_eq!(parse_bisect_vars("bisect_all=0\n"), (None, None));
        assert_eq!(parse_bisect_vars(""), (None, None));
    }

    #[test]
    fn read_terms_defaults_to_bad_good_when_missing() {
        let dir = std::env::temp_dir().join(format!("gm-bisect-terms-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        // No BISECT_TERMS file present.
        assert_eq!(read_terms(&dir), ("bad".to_string(), "good".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_first_bad_parses_the_log_line() {
        let dir = std::env::temp_dir().join(format!("gm-bisect-log-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let log = "git bisect start\n# bad: [aaa] c10\ngit bisect bad aaa\n# first bad commit: [2b6c931c759740aeced7b5afeb2baedc3c7ae6a5] commit 4\n";
        fs::write(dir.join("BISECT_LOG"), log).unwrap();
        let (oid, subject) = read_first_bad(&dir);
        assert_eq!(
            oid,
            Some("2b6c931c759740aeced7b5afeb2baedc3c7ae6a5".to_string())
        );
        assert_eq!(subject, Some("commit 4".to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_first_bad_returns_none_without_the_line() {
        let dir = std::env::temp_dir().join(format!("gm-bisect-nolog-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        fs::write(dir.join("BISECT_LOG"), "git bisect start\n").unwrap();
        assert_eq!(read_first_bad(&dir), (None, None));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn is_valid_range_requires_good_to_be_an_ancestor_of_bad() {
        use std::process::Command;
        let dir = std::env::temp_dir().join(format!(
            "gm-bisect-range-{}-{:?}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::create_dir_all(&dir);
        let git = |args: &[&str]| {
            Command::new("git")
                .arg("-C")
                .arg(&dir)
                .args(args)
                .output()
                .expect("git available")
        };
        git(&["init", "-q"]);
        git(&["config", "user.email", "t@t.co"]);
        git(&["config", "user.name", "t"]);
        for i in 1..=3 {
            fs::write(dir.join("f.txt"), format!("line {i}\n")).unwrap();
            git(&["add", "f.txt"]);
            git(&["commit", "-qm", &format!("commit {i}")]);
        }

        let repo = Repository::open(&dir).unwrap();
        // good older (HEAD~2), bad newer (HEAD): valid.
        assert!(is_valid_range(&repo, "HEAD", "HEAD~2").unwrap());
        // Inverted: bad older than good — invalid.
        assert!(!is_valid_range(&repo, "HEAD~2", "HEAD").unwrap());
        // Same commit — invalid.
        assert!(!is_valid_range(&repo, "HEAD", "HEAD").unwrap());

        let _ = fs::remove_dir_all(&dir);
    }
}
