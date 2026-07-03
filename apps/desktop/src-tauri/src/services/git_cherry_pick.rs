use crate::error::AppError;
use crate::utils::{get_git_signature, short_oid};
use git2::{Oid, Repository};

/// Cherry-picks a commit onto the current HEAD: applies its diff to the working
/// directory/index, then (if there are no conflicts) creates a new commit preserving
/// the original author and message, with the current user as committer.
/// Returns the short SHA of the new commit.
pub fn cherry_pick_commit(repo: &Repository, oid: &str) -> Result<String, String> {
    let target_oid = Oid::from_str(oid).map_err(|_| "Invalid commit OID".to_string())?;
    let commit = repo.find_commit(target_oid).map_err(AppError::Git)?;

    let mut opts = git2::CherrypickOptions::new();
    repo.cherrypick(&commit, Some(&mut opts))
        .map_err(AppError::Git)?;

    let mut index = repo.index().map_err(AppError::Git)?;
    if index.has_conflicts() {
        return Err("Cherry-pick resulted in conflicts".to_string());
    }

    let committer = get_git_signature(repo)?;
    let author = commit.author();
    let message = commit.message().unwrap_or("");

    let tree_oid = index.write_tree().map_err(AppError::Git)?;
    let tree = repo.find_tree(tree_oid).map_err(AppError::Git)?;
    let parent_commit = repo
        .head()
        .map_err(AppError::Git)?
        .peel_to_commit()
        .map_err(AppError::Git)?;

    let new_oid = repo
        .commit(
            Some("HEAD"),
            &author,
            &committer,
            message,
            &tree,
            &[&parent_commit],
        )
        .map_err(AppError::Git)?;

    // Cherry-pick leaves CHERRY_PICK_HEAD/state behind even on success; clear it now
    // that the commit has been created, mirroring what `git cherry-pick` itself does.
    repo.cleanup_state().map_err(AppError::Git)?;

    let sha = new_oid.to_string();
    Ok(short_oid(&sha))
}
