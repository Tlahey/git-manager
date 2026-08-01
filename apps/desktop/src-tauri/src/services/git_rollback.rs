use crate::error::AppError;
use crate::utils::{get_git_signature, short_oid};
use git2::{Oid, Repository, ResetType};
use serde::Serialize;

// ─── Structs ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub oid: String,
    pub short_oid: String,
    pub subject: String,
    pub author_name: String,
    pub timestamp: i64,
}

// ─── revert_commit ────────────────────────────────────────────────────────────

/// Reverts a commit by applying its inverse diff to the working directory and index.
/// If no_commit is false (default), creates a new "Revert" commit.
/// Returns the short SHA of the new commit, or an empty string if no_commit = true.
///
/// `mainline` is `git revert -m`: a **merge** commit has no single "before" state, so git cannot
/// invert it until it is told which parent to consider the mainline (1-based, matching the CLI).
/// Reverting `-m 1` undoes what the *second* side brought in; `-m 2` undoes the first. Omitting it
/// on a merge is refused here rather than left to libgit2, whose own error ("mainline branch is not
/// specified but %s is a merge commit") says nothing about what the caller should have sent.
///
/// It is deliberately **ignored** for an ordinary commit — libgit2 requires mainline 0 there and
/// errors otherwise — so a frontend that always sends the picker's value cannot break the plain
/// single-parent revert path.
pub fn revert_commit(
    repo: &Repository,
    oid: &str,
    no_commit: bool,
    mainline: Option<u32>,
) -> Result<String, String> {
    let target_oid = Oid::from_str(oid).map_err(|_| "Invalid commit OID".to_string())?;
    let commit = repo.find_commit(target_oid).map_err(AppError::Git)?;
    let subject = commit.summary().unwrap_or("").to_string();
    let parent_count = commit.parent_count() as u32;

    let mut opts = git2::RevertOptions::new();
    if parent_count > 1 {
        let mainline = mainline.ok_or_else(|| {
            AppError::InvalidInput(format!(
                "{} is a merge commit: reverting it needs a mainline parent (1..{parent_count})",
                short_oid(oid)
            ))
        })?;
        if mainline == 0 || mainline > parent_count {
            return Err(AppError::InvalidInput(format!(
                "Mainline parent {mainline} is out of range for a commit with {parent_count} parents"
            ))
            .into());
        }
        opts.mainline(mainline);
    }

    repo.revert(&commit, Some(&mut opts))
        .map_err(AppError::Git)?;

    if no_commit {
        return Ok(String::new());
    }

    // Build and write the revert commit
    let sig = get_git_signature(repo)?;

    let mut index = repo.index().map_err(AppError::Git)?;
    let tree_oid = index.write_tree().map_err(AppError::Git)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;
    let parent_commit = repo
        .head()
        .map_err(AppError::Git)?
        .peel_to_commit()
        .map_err(AppError::Git)?;

    let message = format!("Revert \"{subject}\"");
    let new_oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&parent_commit])
        .map_err(AppError::Git)?;

    let sha = new_oid.to_string();
    Ok(short_oid(&sha))
}

// ─── reset_to_commit ──────────────────────────────────────────────────────────

/// Resets HEAD to a given commit.
/// mode: "soft" | "mixed" | "hard"
pub fn reset_to_commit(repo: &Repository, oid: &str, mode: &str) -> Result<(), String> {
    let target_oid = Oid::from_str(oid).map_err(|_| "Invalid commit OID".to_string())?;
    let obj = repo.find_object(target_oid, None).map_err(AppError::Git)?;

    let reset_type = match mode {
        "soft" => ResetType::Soft,
        "hard" => ResetType::Hard,
        _ => ResetType::Mixed,
    };

    repo.reset(&obj, reset_type, None).map_err(AppError::Git)?;
    Ok(())
}

// ─── get_commits_between ──────────────────────────────────────────────────────

/// Returns commits reachable from `from_oid` (or HEAD if "HEAD") but not from `to_oid`.
/// This represents commits that would be undone by a reset to `to_oid`.
pub fn get_commits_between(
    repo: &Repository,
    from_oid: &str,
    to_oid: &str,
) -> Result<Vec<CommitSummary>, String> {
    let to = Oid::from_str(to_oid).map_err(|_| "Invalid to OID".to_string())?;

    let mut walk = repo.revwalk().map_err(AppError::Git)?;

    if from_oid == "HEAD" {
        walk.push_head().map_err(AppError::Git)?;
    } else {
        let from = Oid::from_str(from_oid).map_err(|_| "Invalid from OID".to_string())?;
        walk.push(from).map_err(AppError::Git)?;
    }

    walk.hide(to).map_err(AppError::Git)?;

    let mut summaries = Vec::new();
    for oid_result in walk {
        let oid = oid_result.map_err(AppError::Git)?;
        let commit = repo.find_commit(oid).map_err(AppError::Git)?;
        let sha = oid.to_string();
        summaries.push(CommitSummary {
            oid: sha.clone(),
            short_oid: short_oid(&sha),
            subject: commit.summary().unwrap_or("").to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            timestamp: commit.author().when().seconds(),
        });
    }

    Ok(summaries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::build::CheckoutBuilder;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-rollback-{}-{}-{}",
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

    fn tree_of(repo: &Repository, files: &[(&str, &str)]) -> Oid {
        let mut tb = repo.treebuilder(None).unwrap();
        for (name, content) in files {
            let blob = repo.blob(content.as_bytes()).unwrap();
            tb.insert(name, blob, 0o100644).unwrap();
        }
        tb.write().unwrap()
    }

    /// Commits `tree_oid`, moving HEAD onto it when `advance_head` — libgit2 refuses to move HEAD
    /// onto a commit whose first parent is not the current tip, so the *side* of the merge is
    /// written without touching HEAD and only the merge itself advances it.
    fn commit_as(
        repo: &Repository,
        msg: &str,
        tree_oid: Oid,
        parents: &[Oid],
        advance_head: bool,
    ) -> Oid {
        let sig = get_git_signature(repo).unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        let parent_commits: Vec<git2::Commit> = parents
            .iter()
            .map(|p| repo.find_commit(*p).unwrap())
            .collect();
        let parent_refs: Vec<&git2::Commit> = parent_commits.iter().collect();
        let update_ref = if advance_head { Some("HEAD") } else { None };
        repo.commit(update_ref, &sig, &sig, msg, &tree, &parent_refs)
            .unwrap()
    }

    fn commit_to(repo: &Repository, msg: &str, tree_oid: Oid, parents: &[Oid]) -> Oid {
        commit_as(repo, msg, tree_oid, parents, true)
    }

    /// The files of a commit's tree, as `(path, contents)` pairs sorted by path.
    fn files_at(repo: &Repository, oid: &str) -> Vec<(String, String)> {
        let commit = repo.find_commit(Oid::from_str(oid).unwrap()).unwrap();
        let tree = commit.tree().unwrap();
        let mut out: Vec<(String, String)> = tree
            .iter()
            .map(|entry| {
                let blob = repo.find_blob(entry.id()).unwrap();
                (
                    entry.name().unwrap().to_string(),
                    String::from_utf8(blob.content().to_vec()).unwrap(),
                )
            })
            .collect();
        out.sort();
        out
    }

    fn head_oid(repo: &Repository) -> String {
        repo.head()
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .id()
            .to_string()
    }

    /// A repository whose HEAD is a two-parent merge, checked out:
    ///
    /// ```text
    ///          c2 (feature: adds f.txt) ─┐
    /// c1 (a=base)                        ├─ m
    ///          c3 (main: a=changed) ─────┘
    /// ```
    ///
    /// Reverting `m` with `-m 1` therefore drops `f.txt`, and with `-m 2` restores `a=base`.
    fn merge_repo(name: &str) -> (std::path::PathBuf, Repository, Oid) {
        let dir = temp_dir(name);
        let repo = Repository::init(&dir).unwrap();
        let c1 = commit_to(&repo, "c1", tree_of(&repo, &[("a.txt", "base")]), &[]);
        let c3 = commit_to(&repo, "c3", tree_of(&repo, &[("a.txt", "changed")]), &[c1]);
        let c2 = commit_as(
            &repo,
            "c2",
            tree_of(&repo, &[("a.txt", "base"), ("f.txt", "feat")]),
            &[c1],
            false,
        );
        let merge = commit_to(
            &repo,
            "Merge feature",
            tree_of(&repo, &[("a.txt", "changed"), ("f.txt", "feat")]),
            &[c3, c2],
        );
        // The commits above only wrote trees; materialize HEAD so revert has a clean working tree.
        repo.checkout_head(Some(CheckoutBuilder::new().force()))
            .unwrap();
        (dir, repo, merge)
    }

    #[test]
    fn reverting_a_merge_with_mainline_one_undoes_the_merged_in_side() {
        let (dir, repo, merge) = merge_repo("merge-m1");

        revert_commit(&repo, &merge.to_string(), false, Some(1)).unwrap();

        // -m 1 keeps the first parent's line (a=changed) and undoes what the second brought (f.txt).
        assert_eq!(
            files_at(&repo, &head_oid(&repo)),
            vec![("a.txt".to_string(), "changed".to_string())]
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reverting_a_merge_with_mainline_two_undoes_the_other_side() {
        let (dir, repo, merge) = merge_repo("merge-m2");

        revert_commit(&repo, &merge.to_string(), false, Some(2)).unwrap();

        // -m 2 reads the merge against the feature side, so it undoes main's own change instead.
        assert_eq!(
            files_at(&repo, &head_oid(&repo)),
            vec![
                ("a.txt".to_string(), "base".to_string()),
                ("f.txt".to_string(), "feat".to_string()),
            ]
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reverting_a_merge_without_a_mainline_is_refused_before_git_sees_it() {
        let (dir, repo, merge) = merge_repo("merge-no-mainline");
        let before = head_oid(&repo);

        let err = revert_commit(&repo, &merge.to_string(), false, None).unwrap_err();

        assert!(err.contains("mainline"), "unexpected error: {err}");
        assert_eq!(head_oid(&repo), before, "nothing was committed");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_out_of_range_mainline_is_refused() {
        let (dir, repo, merge) = merge_repo("merge-bad-mainline");

        let err = revert_commit(&repo, &merge.to_string(), false, Some(3)).unwrap_err();

        assert!(err.contains("out of range"), "unexpected error: {err}");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reverting_an_ordinary_commit_still_needs_no_mainline() {
        let dir = temp_dir("plain-revert");
        let repo = Repository::init(&dir).unwrap();
        let c1 = commit_to(&repo, "c1", tree_of(&repo, &[("a.txt", "base")]), &[]);
        let c2 = commit_to(&repo, "c2", tree_of(&repo, &[("a.txt", "changed")]), &[c1]);
        repo.checkout_head(Some(CheckoutBuilder::new().force()))
            .unwrap();

        let sha = revert_commit(&repo, &c2.to_string(), false, None).unwrap();

        assert_eq!(sha.len(), 7, "returns the new commit's short sha");
        assert_eq!(
            files_at(&repo, &head_oid(&repo)),
            vec![("a.txt".to_string(), "base".to_string())]
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_mainline_sent_for_an_ordinary_commit_is_ignored_rather_than_fatal() {
        let dir = temp_dir("plain-revert-mainline");
        let repo = Repository::init(&dir).unwrap();
        let c1 = commit_to(&repo, "c1", tree_of(&repo, &[("a.txt", "base")]), &[]);
        let c2 = commit_to(&repo, "c2", tree_of(&repo, &[("a.txt", "changed")]), &[c1]);
        repo.checkout_head(Some(CheckoutBuilder::new().force()))
            .unwrap();

        // libgit2 rejects a non-zero mainline on a single-parent commit; the service drops it.
        revert_commit(&repo, &c2.to_string(), false, Some(1)).unwrap();

        assert_eq!(
            files_at(&repo, &head_oid(&repo)),
            vec![("a.txt".to_string(), "base".to_string())]
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn no_commit_leaves_the_revert_staged_without_moving_head() {
        let (dir, repo, merge) = merge_repo("merge-no-commit");
        let before = head_oid(&repo);

        let sha = revert_commit(&repo, &merge.to_string(), true, Some(1)).unwrap();

        assert_eq!(sha, "", "no commit was written");
        assert_eq!(head_oid(&repo), before);
        std::fs::remove_dir_all(&dir).ok();
    }
}
