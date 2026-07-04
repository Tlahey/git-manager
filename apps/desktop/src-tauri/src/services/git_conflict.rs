use crate::error::AppError;
use git2::{IndexEntry, Oid, Repository};
use std::path::Path;

/// The three index stages (ancestor/our/their) for a conflicted path.
type ConflictEntries = (Option<IndexEntry>, Option<IndexEntry>, Option<IndexEntry>);

/// Locates the three index stages (ancestor/our/their) for a conflicted path. Returns
/// `Ok(None)` if the path isn't actually conflicted in the index.
pub(crate) fn find_conflict_entries(
    repo: &Repository,
    file_path: &str,
) -> Result<Option<ConflictEntries>, AppError> {
    let index = repo.index().map_err(AppError::Git)?;
    for conflict in index
        .conflicts()
        .map_err(AppError::Git)?
        .filter_map(|c| c.ok())
    {
        let matches = conflict
            .our
            .as_ref()
            .or(conflict.their.as_ref())
            .or(conflict.ancestor.as_ref())
            .map(|e| e.path.as_slice() == file_path.as_bytes())
            .unwrap_or(false);
        if matches {
            return Ok(Some((conflict.ancestor, conflict.our, conflict.their)));
        }
    }
    Ok(None)
}

/// The shape of a conflicted path, used to route between the 3-way text merge view and the
/// coarse binary/delete/rename fallback UI. `Text` carries the three blob Oids (ancestor is
/// `None` for an add/add conflict, where no common ancestor version of the file exists).
pub(crate) enum ConflictShape {
    Text {
        ancestor: Option<Oid>,
        our: Oid,
        their: Oid,
    },
    Binary,
    Delete,
    Rename,
}

/// Classifies a conflicted path's shape from its index entries — shared by the 3-way merge
/// view (`git_merge_diff::get_merge_view`) and the resolve/write helpers below, so binary/
/// delete/rename detection lives in exactly one place.
pub(crate) fn classify_conflict_shape(
    repo: &Repository,
    file_path: &str,
) -> Result<ConflictShape, AppError> {
    let (ancestor, our_entry, their_entry) = find_conflict_entries(repo, file_path)?
        .ok_or_else(|| AppError::ConflictNotFound(file_path.to_string()))?;

    // Delete conflicts: one side has no entry at all (deleted by us / deleted by them).
    let (Some(our_entry), Some(their_entry)) = (our_entry, their_entry) else {
        return Ok(ConflictShape::Delete);
    };

    // Rename conflicts: both sides have an entry, but at different paths.
    if our_entry.path != their_entry.path {
        return Ok(ConflictShape::Rename);
    }

    let our_blob = repo.find_blob(our_entry.id).map_err(AppError::Git)?;
    let their_blob = repo.find_blob(their_entry.id).map_err(AppError::Git)?;
    if our_blob.is_binary() || their_blob.is_binary() {
        return Ok(ConflictShape::Binary);
    }

    Ok(ConflictShape::Text {
        ancestor: ancestor.map(|e| e.id),
        our: our_entry.id,
        their: their_entry.id,
    })
}

/// Writes the resolved content to the working tree and stages it — clears the index conflict
/// for this path exactly like `git_commit.rs::stage_file` does for an ordinary staged edit.
pub fn resolve_conflict(
    repo: &Repository,
    repo_path: &str,
    file_path: &str,
    resolved_content: String,
) -> Result<(), AppError> {
    let (_, our_entry, their_entry) = find_conflict_entries(repo, file_path)?
        .ok_or_else(|| AppError::ConflictNotFound(file_path.to_string()))?;
    if let (Some(our_entry), Some(their_entry)) = (&our_entry, &their_entry) {
        let our_blob = repo.find_blob(our_entry.id).map_err(AppError::Git)?;
        let their_blob = repo.find_blob(their_entry.id).map_err(AppError::Git)?;
        if our_blob.is_binary() || their_blob.is_binary() {
            return Err(AppError::UnparseableConflict(file_path.to_string()));
        }
    }

    let abs_path = Path::new(repo_path).join(file_path);
    std::fs::write(&abs_path, resolved_content).map_err(AppError::Io)?;

    let mut index = repo.index().map_err(AppError::Git)?;
    index
        .add_path(Path::new(file_path))
        .map_err(AppError::Git)?;
    index.write().map_err(AppError::Git)
}

/// Resolves a binary-file conflict by writing one side's raw blob bytes to the working tree
/// and staging it.
pub fn resolve_conflict_binary(
    repo: &Repository,
    repo_path: &str,
    file_path: &str,
    side: &str,
) -> Result<(), AppError> {
    let (_, our_entry, their_entry) = find_conflict_entries(repo, file_path)?
        .ok_or_else(|| AppError::ConflictNotFound(file_path.to_string()))?;

    let chosen = if side == "ours" {
        our_entry
    } else {
        their_entry
    };
    let entry = chosen.ok_or_else(|| AppError::ConflictNotFound(file_path.to_string()))?;
    let blob = repo.find_blob(entry.id).map_err(AppError::Git)?;
    let content = blob.content().to_vec();

    let abs_path = Path::new(repo_path).join(file_path);
    std::fs::write(&abs_path, content).map_err(AppError::Io)?;

    let mut index = repo.index().map_err(AppError::Git)?;
    index
        .add_path(Path::new(file_path))
        .map_err(AppError::Git)?;
    index.write().map_err(AppError::Git)
}
