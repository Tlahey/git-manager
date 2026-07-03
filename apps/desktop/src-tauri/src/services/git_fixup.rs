use crate::error::AppError;
use crate::utils::{get_git_signature, short_oid};
use git2::{Oid, Repository};
use serde::Serialize;

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
/// Returns the short SHA of the new fixup commit.
pub fn create_fixup_commit(repo: &Repository, target_oid: &str) -> Result<String, String> {
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

    let sig = get_git_signature(repo)?;

    let tree_oid = index.write_tree().map_err(AppError::Git)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;

    let message = format!("fixup! {target_subject}");
    let new_oid = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &[&head_commit])
        .map_err(AppError::Git)?;

    let sha = new_oid.to_string();
    Ok(short_oid(&sha))
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
