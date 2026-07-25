//! Merge-target status: how the checked-out branch relates to the branch it is meant to be merged
//! into (`origin/main` by default, configurable per repo in the frontend settings).
//!
//! The merge is simulated **in memory** (`Repository::merge_commits`) — nothing is written to the
//! index, the working directory or `MERGE_HEAD`, so this is safe to poll while the user works. It
//! answers a question GitHub's `mergeStateStatus` only answers once a pull request exists: "would
//! merging my branch into its target conflict, right now?".
use crate::error::AppError;
use git2::{BranchType, Repository};
use serde::{Deserialize, Serialize};

/// Relationship between HEAD and its configured merge target. `target` is `None` when no candidate
/// resolved (e.g. the repo has no `origin/main`), in which case every other field is inert.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MergeTargetStatus {
    /// The resolved target ref, as given in the candidate list (e.g. `origin/main`), or `None`
    /// when none of the candidates exists in this repo.
    pub target: Option<String>,
    /// Short name of the checked-out branch, or `None` on a detached HEAD.
    pub current_branch: Option<String>,
    /// `true` when HEAD *is* the target branch (locally or through its upstream) — there is nothing
    /// to merge, so the frontend hides the indicator entirely.
    pub on_target: bool,
    /// `true` when merging HEAD into `target` would produce at least one conflicted path.
    pub has_conflicts: bool,
    /// Paths that would conflict, sorted and de-duplicated. Empty unless `has_conflicts`.
    pub conflicted_files: Vec<String>,
    /// Commits on HEAD that the target doesn't have.
    pub ahead: usize,
    /// Commits on the target that HEAD doesn't have.
    pub behind: usize,
}

/// Resolves the first candidate in `candidates` that exists in `repo` and returns its commit.
///
/// Candidates are tried in order and each is looked up as a remote branch first (`origin/main`),
/// then as a local branch (`main`), then as a raw revision — so a list can mix `origin/main`,
/// `develop` and a tag without the caller caring which is which. Returns `None` when nothing
/// resolves, which is the normal state of a repo with no remote yet.
fn resolve_target<'repo>(
    repo: &'repo Repository,
    candidates: &[String],
) -> Option<(String, git2::Commit<'repo>)> {
    for candidate in candidates {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        let commit = repo
            .find_branch(trimmed, BranchType::Remote)
            .ok()
            .and_then(|b| b.get().peel_to_commit().ok())
            .or_else(|| {
                repo.find_branch(trimmed, BranchType::Local)
                    .ok()
                    .and_then(|b| b.get().peel_to_commit().ok())
            })
            .or_else(|| {
                repo.revparse_single(trimmed)
                    .ok()
                    .and_then(|obj| obj.peel_to_commit().ok())
            });
        if let Some(commit) = commit {
            return Some((trimmed.to_string(), commit));
        }
    }
    None
}

/// Short name of the checked-out branch (`feat/x`), or `None` when HEAD is detached or unborn.
fn head_branch_name(repo: &Repository) -> Option<String> {
    let head = repo.head().ok()?;
    if !head.is_branch() {
        return None;
    }
    head.shorthand().map(str::to_string)
}

/// `true` when the checked-out branch is the target itself: either the same ref (`main` vs `main`),
/// or a local branch whose upstream is the target (`main` tracking `origin/main`).
fn is_on_target(repo: &Repository, target: &str, head_branch: Option<&str>) -> bool {
    let Some(branch) = head_branch else {
        return false;
    };
    if branch == target {
        return true;
    }
    repo.find_branch(branch, BranchType::Local)
        .ok()
        .and_then(|b| b.upstream().ok())
        .and_then(|up| up.name().ok().flatten().map(str::to_string))
        .is_some_and(|upstream| upstream == target)
}

/// Computes the merge-target status of the checked-out branch against the first resolvable entry of
/// `candidates`.
///
/// The conflict check is an in-memory merge of the two commits, so it reports exactly the paths a
/// real `git merge` would stop on — including a target that has moved ahead since the branch was
/// created, which is the case this indicator exists to catch early. An unborn/detached HEAD, or a
/// HEAD that already is the target, short-circuits before the merge: there is nothing to preview.
pub fn get_merge_target_status(
    repo: &Repository,
    candidates: &[String],
) -> Result<MergeTargetStatus, AppError> {
    let current_branch = head_branch_name(repo);
    let Some((target, target_commit)) = resolve_target(repo, candidates) else {
        return Ok(MergeTargetStatus {
            current_branch,
            ..Default::default()
        });
    };

    let on_target = is_on_target(repo, &target, current_branch.as_deref());
    let head_commit = match repo.head().and_then(|h| h.peel_to_commit()) {
        Ok(commit) => commit,
        // Unborn HEAD (fresh repo, no commit yet): nothing to compare.
        Err(_) => {
            return Ok(MergeTargetStatus {
                target: Some(target),
                current_branch,
                on_target,
                ..Default::default()
            })
        }
    };

    if on_target || head_commit.id() == target_commit.id() {
        return Ok(MergeTargetStatus {
            target: Some(target),
            current_branch,
            on_target: true,
            ..Default::default()
        });
    }

    let (ahead, behind) = repo
        .graph_ahead_behind(head_commit.id(), target_commit.id())
        .unwrap_or((0, 0));

    let index = repo
        .merge_commits(&target_commit, &head_commit, None)
        .map_err(AppError::Git)?;
    let has_conflicts = index.has_conflicts();
    let mut conflicted_files: Vec<String> = Vec::new();
    if has_conflicts {
        for conflict in index.conflicts().map_err(AppError::Git)? {
            let conflict = conflict.map_err(AppError::Git)?;
            // A conflict always carries at least one side; "ours" and "theirs" hold the same path
            // except for rename/delete shapes, where either may be the only one present.
            let path = conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .or(conflict.ancestor.as_ref())
                .map(|entry| String::from_utf8_lossy(&entry.path).to_string());
            if let Some(path) = path {
                conflicted_files.push(path);
            }
        }
        conflicted_files.sort();
        conflicted_files.dedup();
    }

    Ok(MergeTargetStatus {
        target: Some(target),
        current_branch,
        on_target: false,
        has_conflicts,
        conflicted_files,
        ahead,
        behind,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;
    use std::path::PathBuf;

    /// Temp repo with one commit holding `file.txt`, on the `main` branch.
    fn init_repo(name: &str) -> (PathBuf, Repository) {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-merge-target-{}-{}",
            name,
            std::process::id()
        ));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        commit_file(&repo, "file.txt", "base\n", "init");
        {
            // `Repository::init` honours the host's `init.defaultBranch`; pin the name the tests
            // use. `Commit` borrows `repo` and implements `Drop`, so its scope must end before
            // `repo` is moved into the return value below.
            let head = repo.head().unwrap().peel_to_commit().unwrap();
            repo.branch("main", &head, true).unwrap();
        }
        repo.set_head("refs/heads/main").unwrap();
        (dir, repo)
    }

    /// Writes `content` to `name` and commits it on the current branch.
    fn commit_file(repo: &Repository, name: &str, content: &str, message: &str) {
        let workdir = repo.workdir().unwrap().to_path_buf();
        std::fs::write(workdir.join(name), content).unwrap();
        let sig = get_git_signature(repo).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new(name)).unwrap();
        index.write().unwrap();
        let tree_oid = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        let parents = repo
            .head()
            .ok()
            .and_then(|h| h.peel_to_commit().ok())
            .into_iter()
            .collect::<Vec<_>>();
        let parent_refs = parents.iter().collect::<Vec<_>>();
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
            .unwrap();
    }

    /// Creates `name` from the current HEAD and checks it out.
    fn checkout_new_branch(repo: &Repository, name: &str) {
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch(name, &head, true).unwrap();
        repo.set_head(&format!("refs/heads/{name}")).unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();
    }

    fn cleanup(dir: PathBuf) {
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reports_no_target_when_no_candidate_resolves() {
        let (dir, repo) = init_repo("no-target");

        let status = get_merge_target_status(&repo, &["origin/main".to_string()]).unwrap();

        assert_eq!(status.target, None);
        assert_eq!(status.current_branch.as_deref(), Some("main"));
        assert!(!status.on_target);
        cleanup(dir);
    }

    #[test]
    fn picks_the_first_resolvable_candidate() {
        let (dir, repo) = init_repo("first-resolvable");
        checkout_new_branch(&repo, "feature");

        let status = get_merge_target_status(
            &repo,
            &[
                "origin/does-not-exist".to_string(),
                "main".to_string(),
                "develop".to_string(),
            ],
        )
        .unwrap();

        assert_eq!(status.target.as_deref(), Some("main"));
        cleanup(dir);
    }

    #[test]
    fn flags_being_on_the_target_branch() {
        let (dir, repo) = init_repo("on-target");

        let status = get_merge_target_status(&repo, &["main".to_string()]).unwrap();

        assert!(status.on_target);
        assert!(!status.has_conflicts);
        cleanup(dir);
    }

    #[test]
    fn reports_a_clean_merge_with_ahead_behind_counts() {
        let (dir, repo) = init_repo("clean-merge");
        checkout_new_branch(&repo, "feature");
        commit_file(&repo, "feature.txt", "mine\n", "feat");

        let status = get_merge_target_status(&repo, &["main".to_string()]).unwrap();

        assert_eq!(status.target.as_deref(), Some("main"));
        assert_eq!(status.current_branch.as_deref(), Some("feature"));
        assert!(!status.on_target);
        assert!(!status.has_conflicts);
        assert!(status.conflicted_files.is_empty());
        assert_eq!(status.ahead, 1);
        assert_eq!(status.behind, 0);
        cleanup(dir);
    }

    #[test]
    fn detects_a_conflicting_merge_and_lists_the_files() {
        let (dir, repo) = init_repo("conflicting-merge");
        checkout_new_branch(&repo, "feature");
        commit_file(&repo, "file.txt", "theirs\n", "feature edit");
        // Move `main` on: both sides now touch the same line from the same base.
        repo.set_head("refs/heads/main").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();
        commit_file(&repo, "file.txt", "ours\n", "main edit");
        repo.set_head("refs/heads/feature").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))
            .unwrap();

        let status = get_merge_target_status(&repo, &["main".to_string()]).unwrap();

        assert!(status.has_conflicts);
        assert_eq!(status.conflicted_files, vec!["file.txt".to_string()]);
        assert_eq!(status.ahead, 1);
        assert_eq!(status.behind, 1);
        cleanup(dir);
    }

    #[test]
    fn ignores_blank_candidates() {
        let (dir, repo) = init_repo("blank-candidates");
        checkout_new_branch(&repo, "feature");

        let status = get_merge_target_status(
            &repo,
            &["".to_string(), "  ".to_string(), "main".to_string()],
        )
        .unwrap();

        assert_eq!(status.target.as_deref(), Some("main"));
        cleanup(dir);
    }
}
