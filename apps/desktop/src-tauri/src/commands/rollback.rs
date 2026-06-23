use crate::error::AppError;
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
#[tauri::command]
pub async fn revert_commit(
    path: String,
    oid: String,
    no_commit: Option<bool>,
) -> Result<String, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let target_oid = Oid::from_str(&oid).map_err(|_| "Invalid commit OID".to_string())?;
    let commit = repo.find_commit(target_oid).map_err(AppError::Git)?;
    let subject = commit.summary().unwrap_or("").to_string();

    let mut opts = git2::RevertOptions::new();
    repo.revert(&commit, Some(&mut opts)).map_err(AppError::Git)?;

    if no_commit.unwrap_or(false) {
        return Ok(String::new());
    }

    // Build and write the revert commit
    let config = repo.config().map_err(AppError::Git)?;
    let author_name = config
        .get_string("user.name")
        .unwrap_or_else(|_| "Unknown".to_string());
    let author_email = config
        .get_string("user.email")
        .unwrap_or_else(|_| "unknown@unknown.com".to_string());
    let sig = git2::Signature::now(&author_name, &author_email).map_err(AppError::Git)?;

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
    Ok(sha[..7.min(sha.len())].to_string())
}

// ─── reset_to_commit ──────────────────────────────────────────────────────────

/// Resets HEAD to a given commit.
/// mode: "soft" | "mixed" | "hard"
#[tauri::command]
pub async fn reset_to_commit(
    path: String,
    oid: String,
    mode: String,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let target_oid = Oid::from_str(&oid).map_err(|_| "Invalid commit OID".to_string())?;
    let obj = repo
        .find_object(target_oid, None)
        .map_err(AppError::Git)?;

    let reset_type = match mode.as_str() {
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
#[tauri::command]
pub async fn get_commits_between(
    path: String,
    from_oid: String,
    to_oid: String,
) -> Result<Vec<CommitSummary>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let to = Oid::from_str(&to_oid).map_err(|_| "Invalid to OID".to_string())?;

    let mut walk = repo.revwalk().map_err(AppError::Git)?;

    if from_oid == "HEAD" {
        walk.push_head().map_err(AppError::Git)?;
    } else {
        let from = Oid::from_str(&from_oid).map_err(|_| "Invalid from OID".to_string())?;
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
            short_oid: sha[..7.min(sha.len())].to_string(),
            subject: commit.summary().unwrap_or("").to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            timestamp: commit.author().when().seconds(),
        });
    }

    Ok(summaries)
}
