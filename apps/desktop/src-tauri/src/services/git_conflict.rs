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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;
    use std::path::PathBuf;

    fn init_repo(name: &str) -> (PathBuf, Repository) {
        let dir =
            std::env::temp_dir().join(format!("gm-test-conflict-{}-{}", name, std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    /// Commits `content` to `name` on top of HEAD (unborn HEAD produces the root commit).
    fn commit_file(repo: &Repository, dir: &Path, name: &str, content: &[u8], msg: &str) -> Oid {
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

    /// A commit that edits or removes `name` relative to `parent`, without moving any ref — a
    /// side commit the way `git_graph.rs`'s fixtures do, so `our`/`their` can each be built
    /// straight off the same real parent without checkout/branch juggling.
    fn side_commit(
        repo: &Repository,
        parent: &git2::Commit,
        name: &str,
        content: Option<&[u8]>,
        msg: &str,
    ) -> Oid {
        let parent_tree = parent.tree().unwrap();
        let mut tb = repo.treebuilder(Some(&parent_tree)).unwrap();
        match content {
            Some(bytes) => {
                let blob_oid = repo.blob(bytes).unwrap();
                tb.insert(name, blob_oid, 0o100644).unwrap();
            }
            None => {
                tb.remove(name).unwrap();
            }
        }
        let tree = repo.find_tree(tb.write().unwrap()).unwrap();
        let sig = get_git_signature(repo).unwrap();
        repo.commit(None, &sig, &sig, msg, &tree, &[parent])
            .unwrap()
    }

    /// Merges `our`/`their` via `merge_commits` — the same libgit2 merge machinery a real
    /// `git merge` drives — then copies the resulting entries (including the conflict stages)
    /// into the repo's real, disk-backed index, since `merge_commits`'s own `Index` is
    /// in-memory only (no path, so `.write()` on it — including the `.write()` inside
    /// `resolve_conflict`/`resolve_conflict_binary` themselves — would fail). `Index::add`
    /// preserves an entry's stage bits (only the path-length bits of `flags` are recomputed),
    /// so the conflict shape survives the copy intact.
    fn merge_into_index(repo: &Repository, our: Oid, their: Oid) {
        let our_commit = repo.find_commit(our).unwrap();
        let their_commit = repo.find_commit(their).unwrap();
        let merged = repo
            .merge_commits(&our_commit, &their_commit, None)
            .unwrap();

        let mut real_index = repo.index().unwrap();
        real_index.clear().unwrap();
        for entry in merged.iter() {
            real_index.add(&entry).unwrap();
        }
        real_index.write().unwrap();
    }

    struct Fixture {
        dir: PathBuf,
        repo: Repository,
    }

    /// Both sides modify `f.txt` differently from a shared text ancestor — a genuine,
    /// resolvable-as-text conflict.
    fn build_text_conflict(name: &str) -> Fixture {
        let (dir, repo) = init_repo(name);
        let base_oid = commit_file(&repo, &dir, "f.txt", b"line\n", "base");
        // Scoped so the borrowed `Commit` drops before `repo` is moved into `Fixture` below
        // (same pattern `git_graph.rs`'s test fixtures use).
        {
            let base_commit = repo.find_commit(base_oid).unwrap();
            let our_oid = side_commit(&repo, &base_commit, "f.txt", Some(b"ours\n"), "our change");
            let their_oid = side_commit(
                &repo,
                &base_commit,
                "f.txt",
                Some(b"theirs\n"),
                "their change",
            );
            merge_into_index(&repo, our_oid, their_oid);
        }
        Fixture { dir, repo }
    }

    /// Ours deletes `f.txt`, theirs modifies it — a delete/modify conflict shape.
    fn build_delete_conflict(name: &str) -> Fixture {
        let (dir, repo) = init_repo(name);
        let base_oid = commit_file(&repo, &dir, "f.txt", b"line\n", "base");
        {
            let base_commit = repo.find_commit(base_oid).unwrap();
            let our_oid = side_commit(&repo, &base_commit, "f.txt", None, "we deleted it");
            let their_oid = side_commit(
                &repo,
                &base_commit,
                "f.txt",
                Some(b"theirs\n"),
                "they changed it",
            );
            merge_into_index(&repo, our_oid, their_oid);
        }
        Fixture { dir, repo }
    }

    /// Both sides modify `f.txt` with content containing a NUL byte — git2 flags such blobs
    /// `is_binary()`, the same signal `classify_conflict_shape` uses to route to the binary
    /// fallback UI instead of the 3-way text merge view.
    fn build_binary_conflict(name: &str) -> Fixture {
        let (dir, repo) = init_repo(name);
        let base_oid = commit_file(&repo, &dir, "f.txt", b"line\n", "base");
        {
            let base_commit = repo.find_commit(base_oid).unwrap();
            let our_oid = side_commit(
                &repo,
                &base_commit,
                "f.txt",
                Some(b"line\x00ours\n"),
                "our binary change",
            );
            let their_oid = side_commit(
                &repo,
                &base_commit,
                "f.txt",
                Some(b"line\x00theirs\n"),
                "their binary change",
            );
            merge_into_index(&repo, our_oid, their_oid);
        }
        Fixture { dir, repo }
    }

    #[test]
    fn find_conflict_entries_returns_none_for_a_clean_path() {
        let (dir, repo) = init_repo("find-none");
        commit_file(&repo, &dir, "f.txt", b"line\n", "base");

        assert!(find_conflict_entries(&repo, "f.txt").unwrap().is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn find_conflict_entries_returns_all_three_stages_for_a_real_conflict() {
        let f = build_text_conflict("find-three-stages");

        let (ancestor, our, their) = find_conflict_entries(&f.repo, "f.txt").unwrap().unwrap();
        assert!(ancestor.is_some());
        assert!(our.is_some());
        assert!(their.is_some());

        let our_blob = f.repo.find_blob(our.unwrap().id).unwrap();
        assert_eq!(our_blob.content(), b"ours\n");
        let their_blob = f.repo.find_blob(their.unwrap().id).unwrap();
        assert_eq!(their_blob.content(), b"theirs\n");
        let ancestor_blob = f.repo.find_blob(ancestor.unwrap().id).unwrap();
        assert_eq!(ancestor_blob.content(), b"line\n");
        std::fs::remove_dir_all(&f.dir).ok();
    }

    #[test]
    fn classify_conflict_shape_errors_when_the_path_is_not_conflicted() {
        let (dir, repo) = init_repo("classify-not-found");
        commit_file(&repo, &dir, "f.txt", b"line\n", "base");

        // `ConflictShape` (the `Ok` type) deliberately doesn't derive `Debug`, so match on the
        // whole `Result` instead of `.unwrap_err()` (which would require it).
        let result = classify_conflict_shape(&repo, "f.txt");
        assert!(matches!(result, Err(AppError::ConflictNotFound(p)) if p == "f.txt"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn classify_conflict_shape_returns_text_with_the_three_oids() {
        let f = build_text_conflict("classify-text");

        let shape = classify_conflict_shape(&f.repo, "f.txt").unwrap();
        match shape {
            ConflictShape::Text {
                ancestor,
                our,
                their,
            } => {
                assert!(ancestor.is_some());
                assert_eq!(f.repo.find_blob(our).unwrap().content(), b"ours\n");
                assert_eq!(f.repo.find_blob(their).unwrap().content(), b"theirs\n");
            }
            _ => panic!("expected a Text conflict shape"),
        }
        std::fs::remove_dir_all(&f.dir).ok();
    }

    #[test]
    fn classify_conflict_shape_returns_delete_when_one_side_removes_the_file() {
        let f = build_delete_conflict("classify-delete");

        let shape = classify_conflict_shape(&f.repo, "f.txt").unwrap();
        assert!(matches!(shape, ConflictShape::Delete));
        std::fs::remove_dir_all(&f.dir).ok();
    }

    #[test]
    fn classify_conflict_shape_returns_binary_when_either_side_is_binary() {
        let f = build_binary_conflict("classify-binary");

        let shape = classify_conflict_shape(&f.repo, "f.txt").unwrap();
        assert!(matches!(shape, ConflictShape::Binary));
        std::fs::remove_dir_all(&f.dir).ok();
    }

    #[test]
    fn resolve_conflict_writes_the_resolution_and_clears_the_conflict() {
        let f = build_text_conflict("resolve-text");
        let dir_str = f.dir.to_str().unwrap();

        resolve_conflict(&f.repo, dir_str, "f.txt", "resolved\n".to_string()).unwrap();

        assert_eq!(
            std::fs::read_to_string(f.dir.join("f.txt")).unwrap(),
            "resolved\n"
        );
        assert!(!f.repo.index().unwrap().has_conflicts());
        assert!(find_conflict_entries(&f.repo, "f.txt").unwrap().is_none());
        std::fs::remove_dir_all(&f.dir).ok();
    }

    #[test]
    fn resolve_conflict_rejects_a_binary_conflict() {
        let f = build_binary_conflict("resolve-binary-rejected");
        let dir_str = f.dir.to_str().unwrap();

        let err = resolve_conflict(&f.repo, dir_str, "f.txt", "text\n".to_string()).unwrap_err();
        assert!(matches!(err, AppError::UnparseableConflict(p) if p == "f.txt"));
        std::fs::remove_dir_all(&f.dir).ok();
    }

    #[test]
    fn resolve_conflict_errors_when_path_is_not_conflicted() {
        let (dir, repo) = init_repo("resolve-not-found");
        commit_file(&repo, &dir, "f.txt", b"line\n", "base");
        let dir_str = dir.to_str().unwrap();

        let err = resolve_conflict(&repo, dir_str, "f.txt", "whatever".to_string()).unwrap_err();
        assert!(matches!(err, AppError::ConflictNotFound(p) if p == "f.txt"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn resolve_conflict_binary_writes_our_side_and_clears_the_conflict() {
        let f = build_binary_conflict("resolve-binary-ours");
        let dir_str = f.dir.to_str().unwrap();

        resolve_conflict_binary(&f.repo, dir_str, "f.txt", "ours").unwrap();

        assert_eq!(
            std::fs::read(f.dir.join("f.txt")).unwrap(),
            b"line\x00ours\n"
        );
        assert!(!f.repo.index().unwrap().has_conflicts());
        std::fs::remove_dir_all(&f.dir).ok();
    }

    #[test]
    fn resolve_conflict_binary_writes_their_side() {
        let f = build_binary_conflict("resolve-binary-theirs");
        let dir_str = f.dir.to_str().unwrap();

        resolve_conflict_binary(&f.repo, dir_str, "f.txt", "theirs").unwrap();

        assert_eq!(
            std::fs::read(f.dir.join("f.txt")).unwrap(),
            b"line\x00theirs\n"
        );
        std::fs::remove_dir_all(&f.dir).ok();
    }

    #[test]
    fn resolve_conflict_binary_errors_when_path_is_not_conflicted() {
        let (dir, repo) = init_repo("resolve-binary-not-found");
        commit_file(&repo, &dir, "f.txt", b"line\n", "base");
        let dir_str = dir.to_str().unwrap();

        let err = resolve_conflict_binary(&repo, dir_str, "f.txt", "ours").unwrap_err();
        assert!(matches!(err, AppError::ConflictNotFound(p) if p == "f.txt"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
