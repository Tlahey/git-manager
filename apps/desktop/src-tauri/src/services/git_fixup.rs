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
