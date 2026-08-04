use crate::error::AppError;
use crate::services::git_commit::CommitResult;
use crate::utils::{get_git_signature, short_oid};
use git2::{Oid, Repository};
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::Path;

// ─── Structs ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixupInfo {
    pub fixup_oid: String,
    pub fixup_short_oid: String,
    pub target_oid: String,
    pub target_subject: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutosquashGroup {
    pub base_oid: String,
    pub base_subject: String,
    pub fixups: Vec<String>, // short OIDs
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FixupRiskCommit {
    pub oid: String,
    pub short_oid: String,
    pub subject: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixupFileRisk {
    pub path: String,
    pub commits: Vec<FixupRiskCommit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixupTargetWarnings {
    /// Staged paths absent from the target commit's tree — squashing them there produces a
    /// modify/delete conflict the moment the rebase replays this step (the file has nothing to
    /// merge into: it doesn't exist yet at that point in history).
    pub missing_in_target: Vec<String>,
    /// Staged paths also touched by a commit strictly between the target and HEAD — squashing
    /// may conflict when that later commit gets replayed on top of the now-earlier change.
    pub touched_after_target: Vec<FixupFileRisk>,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn collect_commit_subjects(repo: &Repository) -> Result<Vec<(String, String)>, String> {
    let mut walk = repo.revwalk().map_err(AppError::Git)?;
    walk.push_head().map_err(AppError::Git)?;

    let mut commits: Vec<(String, String)> = Vec::new();
    for oid_result in walk {
        let oid = oid_result.map_err(AppError::Git)?;
        let commit = repo.find_commit(oid).map_err(AppError::Git)?;
        let subject = commit.summary().unwrap_or("").to_string();
        commits.push((oid.to_string(), subject));
    }
    Ok(commits)
}

// ─── create_fixup_commit ──────────────────────────────────────────────────────

/// Creates a fixup! commit for the target commit from the current staged changes.
/// `message` overrides the generated `fixup! <subject>` when provided (the commit
/// dialog lets the user edit it); autosquash matching only works if the first
/// line keeps the `fixup! <subject>` form. Returns the full + short OID of the new commit
/// (same shape as `git_commit::create_commit`'s `CommitResult`, so the frontend can undo a
/// fixup exactly like a regular commit — it's a plain new commit on top of HEAD either way).
pub fn create_fixup_commit(
    repo: &Repository,
    target_oid: &str,
    message: Option<&str>,
) -> Result<CommitResult, String> {
    let parsed_oid = Oid::from_str(target_oid).map_err(|_| "Invalid target OID".to_string())?;
    let target_commit = repo.find_commit(parsed_oid).map_err(AppError::Git)?;
    let target_subject = target_commit.summary().unwrap_or("").to_string();

    // Ensure there are staged changes
    let head_commit = repo
        .head()
        .map_err(AppError::Git)?
        .peel_to_commit()
        .map_err(AppError::Git)?;
    let head_tree = head_commit.tree().map_err(AppError::Git)?;
    let mut index = repo.index().map_err(AppError::Git)?;
    let diff = repo
        .diff_tree_to_index(Some(&head_tree), Some(&index), None)
        .map_err(AppError::Git)?;

    if diff.deltas().count() == 0 {
        return Err("No staged changes to create a fixup commit".to_string());
    }

    if index.has_conflicts() {
        return Err("Resolve pending conflicts before creating a fixup commit".to_string());
    }

    let sig = get_git_signature(repo)?;

    let tree_oid = index.write_tree().map_err(AppError::Git)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;

    let message = match message.map(str::trim).filter(|m| !m.is_empty()) {
        Some(custom) => custom.to_string(),
        None => format!("fixup! {target_subject}"),
    };
    let new_oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&head_commit])
        .map_err(AppError::Git)?;

    let sha = new_oid.to_string();
    Ok(CommitResult {
        short_oid: short_oid(&sha),
        oid: sha,
    })
}

// ─── check_fixup_target ────────────────────────────────────────────────────────

/// Collects the paths touched by a diff (added/modified/deleted/renamed), best-effort — used to
/// build both the staged-file set and each intervening commit's touched-file set below.
fn diff_paths(diff: &git2::Diff) -> Result<Vec<String>, AppError> {
    let mut paths = Vec::new();
    diff.foreach(
        &mut |delta, _| {
            if let Some(p) = delta.new_file().path().or_else(|| delta.old_file().path()) {
                paths.push(p.to_string_lossy().into_owned());
            }
            true
        },
        None,
        None,
        None,
    )
    .map_err(AppError::Git)?;
    Ok(paths)
}

/// Warns the user, *before* they commit to a fixup, about staged files that are likely to
/// conflict once the fixup is actually squashed into `target_oid` during a rebase — the two
/// cheap, high-signal checks that don't require simulating the rebase itself:
///   - the file doesn't exist yet in the target commit's tree (a guaranteed modify/delete
///     conflict — this is exactly what happens when a fixup is aimed at a commit that predates
///     the one that actually introduced the file);
///   - the file is also touched by a commit strictly between the target and HEAD (the exact
///     set of commits the rebase plan will replay after the fixup) — not a guaranteed conflict
///     (the changes may not overlap), but worth flagging.
pub fn check_fixup_target(
    repo: &Repository,
    target_oid: &str,
) -> Result<FixupTargetWarnings, String> {
    let parsed_target = Oid::from_str(target_oid).map_err(|_| "Invalid target OID".to_string())?;
    let target_commit = repo.find_commit(parsed_target).map_err(AppError::Git)?;
    let target_tree = target_commit.tree().map_err(AppError::Git)?;

    // Same staged-file set create_fixup_commit will actually commit.
    let head_commit = repo
        .head()
        .map_err(AppError::Git)?
        .peel_to_commit()
        .map_err(AppError::Git)?;
    let head_tree = head_commit.tree().map_err(AppError::Git)?;
    let index = repo.index().map_err(AppError::Git)?;
    let staged_diff = repo
        .diff_tree_to_index(Some(&head_tree), Some(&index), None)
        .map_err(AppError::Git)?;
    let staged_paths = diff_paths(&staged_diff)?;

    if staged_paths.is_empty() {
        return Ok(FixupTargetWarnings {
            missing_in_target: Vec::new(),
            touched_after_target: Vec::new(),
        });
    }

    let missing_in_target: Vec<String> = staged_paths
        .iter()
        .filter(|p| target_tree.get_path(Path::new(p)).is_err())
        .cloned()
        .collect();

    // Commits strictly between the target (exclusive) and HEAD (inclusive) — mirrors
    // `git_interactive_rebase::list_rebase_commits`'s walk, the exact set the rebase plan
    // replays after the fixup squash.
    let mut walk = repo.revwalk().map_err(AppError::Git)?;
    walk.push_head().map_err(AppError::Git)?;
    walk.set_sorting(git2::Sort::TOPOLOGICAL)
        .map_err(AppError::Git)?;

    let mut touched: BTreeMap<String, Vec<FixupRiskCommit>> = BTreeMap::new();
    for oid_result in walk {
        let oid = oid_result.map_err(AppError::Git)?;
        if oid == parsed_target {
            break;
        }
        let commit = repo.find_commit(oid).map_err(AppError::Git)?;
        let tree = commit.tree().map_err(AppError::Git)?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());
        let diff = repo
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
            .map_err(AppError::Git)?;
        let touched_paths = diff_paths(&diff)?;

        for path in staged_paths.iter().filter(|p| touched_paths.contains(p)) {
            let sha = oid.to_string();
            touched
                .entry(path.clone())
                .or_default()
                .push(FixupRiskCommit {
                    short_oid: short_oid(&sha),
                    oid: sha,
                    subject: commit.summary().unwrap_or("").to_string(),
                });
        }
    }

    let touched_after_target = touched
        .into_iter()
        .map(|(path, commits)| FixupFileRisk { path, commits })
        .collect();

    Ok(FixupTargetWarnings {
        missing_in_target,
        touched_after_target,
    })
}

// ─── list_pending_fixups ──────────────────────────────────────────────────────

/// Returns the list of fixup! commits that have a matching base commit in history.
pub fn list_pending_fixups(repo: &Repository) -> Result<Vec<FixupInfo>, String> {
    let commits = collect_commit_subjects(repo)?;

    let mut fixups = Vec::new();
    for (fixup_oid, fixup_subject) in &commits {
        if let Some(target_subject) = fixup_subject.strip_prefix("fixup! ") {
            if let Some((target_oid, _)) = commits.iter().find(|(_, s)| s == target_subject) {
                let fixup_sha = fixup_oid.clone();
                let target_sha = target_oid.clone();
                fixups.push(FixupInfo {
                    fixup_oid: fixup_sha.clone(),
                    fixup_short_oid: short_oid(&fixup_sha),
                    target_oid: target_sha.clone(),
                    target_subject: target_subject.to_string(),
                });
            }
        }
    }

    Ok(fixups)
}

// ─── group_into_autosquash ────────────────────────────────────────────────────

/// Groups fixup commits with their base commits for preview.
pub fn group_into_autosquash(fixups: &[FixupInfo]) -> Vec<AutosquashGroup> {
    let mut groups: Vec<AutosquashGroup> = Vec::new();
    for fixup in fixups {
        if let Some(group) = groups.iter_mut().find(|g| g.base_oid == fixup.target_oid) {
            group.fixups.push(fixup.fixup_short_oid.clone());
        } else {
            groups.push(AutosquashGroup {
                base_oid: fixup.target_oid.clone(),
                base_subject: fixup.target_subject.clone(),
                fixups: vec![fixup.fixup_short_oid.clone()],
            });
        }
    }

    groups
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;
    use std::path::PathBuf;

    // ── `group_into_autosquash` — pure, no repo needed ────────────────────────

    fn fixup_info(fixup_short_oid: &str, target_oid: &str, target_subject: &str) -> FixupInfo {
        FixupInfo {
            fixup_oid: format!("{fixup_short_oid}-full"),
            fixup_short_oid: fixup_short_oid.to_string(),
            target_oid: target_oid.to_string(),
            target_subject: target_subject.to_string(),
        }
    }

    #[test]
    fn empty_fixup_list_produces_no_groups() {
        let groups = group_into_autosquash(&[]);
        assert!(groups.is_empty());
    }

    #[test]
    fn a_single_fixup_creates_a_single_group() {
        let fixups = vec![fixup_info("abc1234", "deadbeef", "feat: add thing")];
        let groups = group_into_autosquash(&fixups);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].base_oid, "deadbeef");
        assert_eq!(groups[0].base_subject, "feat: add thing");
        assert_eq!(groups[0].fixups, vec!["abc1234".to_string()]);
    }

    #[test]
    fn multiple_fixups_for_the_same_target_land_in_one_group_in_encounter_order() {
        let fixups = vec![
            fixup_info("f1", "target1", "feat: base"),
            fixup_info("f2", "target1", "feat: base"),
            fixup_info("f3", "target1", "feat: base"),
        ];
        let groups = group_into_autosquash(&fixups);
        assert_eq!(groups.len(), 1);
        assert_eq!(
            groups[0].fixups,
            vec!["f1".to_string(), "f2".to_string(), "f3".to_string()]
        );
    }

    #[test]
    fn independent_targets_produce_separate_groups_in_first_seen_order() {
        // f2 (target-b) is interleaved between the two target-a fixups — grouping must not
        // depend on the input being pre-sorted by target.
        let fixups = vec![
            fixup_info("f1", "target-a", "feat: a"),
            fixup_info("f2", "target-b", "feat: b"),
            fixup_info("f3", "target-a", "feat: a"),
        ];
        let groups = group_into_autosquash(&fixups);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].base_oid, "target-a");
        assert_eq!(groups[0].fixups, vec!["f1".to_string(), "f3".to_string()]);
        assert_eq!(groups[1].base_oid, "target-b");
        assert_eq!(groups[1].fixups, vec!["f2".to_string()]);
    }

    #[test]
    fn grouping_keys_purely_on_target_oid_not_target_subject() {
        // In practice every FixupInfo for the same target carries an identical subject (both
        // come from the same commit via `list_pending_fixups`), but `group_into_autosquash`
        // itself only compares `target_oid` — pin that down, and confirm the group's label
        // comes from whichever fixup is encountered first.
        let fixups = vec![
            fixup_info("f1", "target-a", "feat: original subject"),
            fixup_info("f2", "target-a", "feat: a different subject string"),
        ];
        let groups = group_into_autosquash(&fixups);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].base_subject, "feat: original subject");
        assert_eq!(groups[0].fixups, vec!["f1".to_string(), "f2".to_string()]);
    }

    // ── Repo fixtures for `list_pending_fixups` / `check_fixup_target` / `create_fixup_commit` ──

    fn init_repo(name: &str) -> (PathBuf, Repository) {
        let dir =
            std::env::temp_dir().join(format!("gm-test-fixup-{}-{}", name, std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    /// Commits `content` to `name` on top of HEAD (unborn HEAD produces the root commit).
    fn commit_file(repo: &Repository, dir: &Path, name: &str, content: &str, msg: &str) -> Oid {
        std::fs::write(dir.join(name), content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(name)).unwrap();
        index.write().unwrap();
        let tree_oid = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_oid).unwrap();
        let sig = get_git_signature(repo).unwrap();
        let parent = repo
            .head()
            .ok()
            .and_then(|h| h.target())
            .and_then(|o| repo.find_commit(o).ok());
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents)
            .unwrap()
    }

    /// Stages `content` for `name` without committing, so `create_fixup_commit`/
    /// `check_fixup_target` see it via `diff_tree_to_index`.
    fn stage_file(repo: &Repository, dir: &Path, name: &str, content: &str) {
        std::fs::write(dir.join(name), content).unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new(name)).unwrap();
        index.write().unwrap();
    }

    /// Builds a real, unresolved merge conflict directly in the repo's index (same technique
    /// `git_conflict.rs`'s tests use) — `create_fixup_commit` must refuse to run while one is
    /// pending, and this is the only way to get `index.has_conflicts()` true without shelling
    /// out to `git merge`. HEAD stays on the (unconflicted) base commit — `our`/`their` are
    /// side commits that never move any ref — so `create_fixup_commit`'s own `repo.head()`
    /// lookup still succeeds and the test actually exercises the conflict check rather than
    /// failing earlier on an unborn HEAD. Returns the base commit's oid, usable as a fixup
    /// target.
    fn make_index_conflicted(repo: &Repository, dir: &Path, name: &str) -> Oid {
        let base_oid = commit_file(repo, dir, name, "base", "base");
        let base_commit = repo.find_commit(base_oid).unwrap();
        let base_tree = base_commit.tree().unwrap();
        let sig = get_git_signature(repo).unwrap();

        let side_commit = |content: &str, msg: &str| -> Oid {
            let blob_oid = repo.blob(content.as_bytes()).unwrap();
            let mut tb = repo.treebuilder(Some(&base_tree)).unwrap();
            tb.insert(name, blob_oid, 0o100644).unwrap();
            let tree = repo.find_tree(tb.write().unwrap()).unwrap();
            repo.commit(None, &sig, &sig, msg, &tree, &[&base_commit])
                .unwrap()
        };
        let our_oid = side_commit("ours", "our change");
        let their_oid = side_commit("theirs", "their change");

        // `merge_commits`'s own `Index` is in-memory only (no on-disk path), so copy its
        // entries — including the conflict stages, preserved via `add`'s flags handling —
        // into the repo's real, disk-backed index instead (see `git_conflict.rs`'s tests for
        // the same technique, used there for the same reason).
        let our_commit = repo.find_commit(our_oid).unwrap();
        let their_commit = repo.find_commit(their_oid).unwrap();
        let merged = repo
            .merge_commits(&our_commit, &their_commit, None)
            .unwrap();
        let mut real_index = repo.index().unwrap();
        real_index.clear().unwrap();
        for entry in merged.iter() {
            real_index.add(&entry).unwrap();
        }
        real_index.write().unwrap();

        base_oid
    }

    // ── `list_pending_fixups` ──────────────────────────────────────────────────

    #[test]
    fn list_pending_fixups_is_empty_without_any_fixup_commits() {
        let (dir, repo) = init_repo("list-none");
        commit_file(&repo, &dir, "a.txt", "one", "feat: first");
        commit_file(&repo, &dir, "a.txt", "two", "feat: second");

        assert!(list_pending_fixups(&repo).unwrap().is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_pending_fixups_matches_a_fixup_to_its_target() {
        let (dir, repo) = init_repo("list-match");
        let target = commit_file(&repo, &dir, "a.txt", "one", "feat: add thing");
        commit_file(&repo, &dir, "a.txt", "two", "fixup! feat: add thing");

        let fixups = list_pending_fixups(&repo).unwrap();
        assert_eq!(fixups.len(), 1);
        assert_eq!(fixups[0].target_oid, target.to_string());
        assert_eq!(fixups[0].target_subject, "feat: add thing");
        assert_eq!(fixups[0].fixup_short_oid.len(), 7);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_pending_fixups_ignores_a_fixup_with_no_matching_target() {
        let (dir, repo) = init_repo("list-orphan");
        commit_file(&repo, &dir, "a.txt", "one", "feat: unrelated");
        commit_file(
            &repo,
            &dir,
            "a.txt",
            "two",
            "fixup! feat: a subject that was never committed",
        );

        assert!(list_pending_fixups(&repo).unwrap().is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_pending_fixups_matches_multiple_independent_targets() {
        let (dir, repo) = init_repo("list-multi");
        let target_a = commit_file(&repo, &dir, "a.txt", "one", "feat: a");
        let target_b = commit_file(&repo, &dir, "b.txt", "one", "feat: b");
        commit_file(&repo, &dir, "a.txt", "two", "fixup! feat: a");
        commit_file(&repo, &dir, "b.txt", "two", "fixup! feat: b");

        let fixups = list_pending_fixups(&repo).unwrap();
        assert_eq!(fixups.len(), 2);
        assert!(fixups
            .iter()
            .any(|f| f.target_oid == target_a.to_string() && f.target_subject == "feat: a"));
        assert!(fixups
            .iter()
            .any(|f| f.target_oid == target_b.to_string() && f.target_subject == "feat: b"));

        // And grouping them lands each fixup in its own group, matching its own target.
        let groups = group_into_autosquash(&fixups);
        assert_eq!(groups.len(), 2);
        std::fs::remove_dir_all(&dir).ok();
    }

    // ── `check_fixup_target` ───────────────────────────────────────────────────

    #[test]
    fn check_fixup_target_is_clean_when_the_file_exists_and_is_untouched_since() {
        let (dir, repo) = init_repo("check-clean");
        let target = commit_file(&repo, &dir, "a.txt", "one", "feat: add a");
        stage_file(&repo, &dir, "a.txt", "two");

        let warnings = check_fixup_target(&repo, &target.to_string()).unwrap();
        assert!(warnings.missing_in_target.is_empty());
        assert!(warnings.touched_after_target.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn check_fixup_target_flags_a_staged_file_missing_from_the_target_tree() {
        let (dir, repo) = init_repo("check-missing");
        let target = commit_file(&repo, &dir, "a.txt", "one", "feat: add a");
        // b.txt doesn't exist yet at `target` — introduced only by this later commit.
        commit_file(&repo, &dir, "b.txt", "one", "feat: add b");
        stage_file(&repo, &dir, "b.txt", "two");

        let warnings = check_fixup_target(&repo, &target.to_string()).unwrap();
        assert_eq!(warnings.missing_in_target, vec!["b.txt".to_string()]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn check_fixup_target_flags_a_staged_file_touched_between_target_and_head() {
        let (dir, repo) = init_repo("check-touched");
        let target = commit_file(&repo, &dir, "a.txt", "one", "feat: add a");
        let between = commit_file(&repo, &dir, "a.txt", "two", "feat: tweak a");
        stage_file(&repo, &dir, "a.txt", "three");

        let warnings = check_fixup_target(&repo, &target.to_string()).unwrap();
        assert!(warnings.missing_in_target.is_empty());
        assert_eq!(warnings.touched_after_target.len(), 1);
        let risk = &warnings.touched_after_target[0];
        assert_eq!(risk.path, "a.txt");
        assert_eq!(risk.commits.len(), 1);
        assert_eq!(risk.commits[0].oid, between.to_string());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn check_fixup_target_is_a_noop_with_no_staged_changes() {
        let (dir, repo) = init_repo("check-empty");
        let target = commit_file(&repo, &dir, "a.txt", "one", "feat: add a");

        let warnings = check_fixup_target(&repo, &target.to_string()).unwrap();
        assert!(warnings.missing_in_target.is_empty());
        assert!(warnings.touched_after_target.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    // ── `create_fixup_commit` ──────────────────────────────────────────────────

    #[test]
    fn create_fixup_commit_generates_the_conventional_fixup_message() {
        let (dir, repo) = init_repo("create-default-message");
        let target = commit_file(&repo, &dir, "a.txt", "one", "feat: add a");
        stage_file(&repo, &dir, "a.txt", "two");

        let result = create_fixup_commit(&repo, &target.to_string(), None).unwrap();

        let new_commit = repo
            .find_commit(Oid::from_str(&result.oid).unwrap())
            .unwrap();
        assert_eq!(new_commit.summary(), Some("fixup! feat: add a"));
        assert_eq!(new_commit.parent_id(0).unwrap(), target);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn create_fixup_commit_honors_a_custom_message() {
        let (dir, repo) = init_repo("create-custom-message");
        let target = commit_file(&repo, &dir, "a.txt", "one", "feat: add a");
        stage_file(&repo, &dir, "a.txt", "two");

        let result =
            create_fixup_commit(&repo, &target.to_string(), Some("  fixup! custom text  "))
                .unwrap();

        let new_commit = repo
            .find_commit(Oid::from_str(&result.oid).unwrap())
            .unwrap();
        assert_eq!(new_commit.summary(), Some("fixup! custom text"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn create_fixup_commit_rejects_an_empty_target_oid() {
        let (dir, repo) = init_repo("create-bad-oid");
        commit_file(&repo, &dir, "a.txt", "one", "feat: add a");

        let err = create_fixup_commit(&repo, "not-an-oid", None).unwrap_err();
        assert_eq!(err, "Invalid target OID");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn create_fixup_commit_rejects_when_nothing_is_staged() {
        let (dir, repo) = init_repo("create-no-staged");
        let target = commit_file(&repo, &dir, "a.txt", "one", "feat: add a");

        let err = create_fixup_commit(&repo, &target.to_string(), None).unwrap_err();
        assert_eq!(err, "No staged changes to create a fixup commit");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn create_fixup_commit_rejects_a_conflicted_index() {
        let (dir, repo) = init_repo("create-conflicted");
        let target = make_index_conflicted(&repo, &dir, "a.txt");

        let result = create_fixup_commit(&repo, &target.to_string(), None);
        assert!(result.is_err());
        std::fs::remove_dir_all(&dir).ok();
    }
}
