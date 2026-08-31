use crate::error::AppError;
use git2::{IndexAddOption, Oid, Repository};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const PIN_NAMESPACE: &str = "refs/git-manager/undo/";

fn pin_ref_name(ref_name: &str) -> String {
    format!("{PIN_NAMESPACE}{ref_name}")
}

pub fn pin_oid(repo: &Repository, ref_name: &str, oid: Oid) -> Result<(), git2::Error> {
    repo.reference(
        &pin_ref_name(ref_name),
        oid,
        true,
        "git-manager: pin for undo history",
    )?;
    Ok(())
}

/// Resolves a revision (`HEAD`, a branch or tag name, a short sha, `HEAD~2`, …) to its full OID.
///
/// Exists for the undo history, which has to record *where HEAD was* as something it can come back
/// to later. A name is not good enough: `HEAD` means something different after the checkout that
/// entry is undoing, and a detached HEAD reports its branch name as the literal string `"HEAD"`
/// (`build_git_repo`/`get_repo_summary`), which resolves to nothing at all. Undoing a checkout made
/// from a detached HEAD therefore failed with "Branch not found: HEAD", and the pin meant to keep
/// that commit alive failed too, silently — `pin_object` takes an OID and was handed the same
/// string.
pub fn resolve_revision(repo: &Repository, revision: &str) -> Result<String, String> {
    let object = repo.revparse_single(revision).map_err(AppError::Git)?;
    let commit = object.peel_to_commit().map_err(AppError::Git)?;
    Ok(commit.id().to_string())
}

// ─── Generic pinning (used to protect an object that already exists, e.g. the
// commit behind a stash before pop/drop) ────────────────────────────────────

/// Creates/overwrites a hidden ref (`refs/git-manager/undo/<ref_name>`) pointing at `oid`, to
/// keep `git gc` from collecting it while the matching history entry still exists. Works for a
/// blob, tree, or commit OID indifferently.
pub fn pin_object(repo: &Repository, ref_name: &str, oid: &str) -> Result<(), String> {
    let target_oid = Oid::from_str(oid).map_err(AppError::Git)?;
    pin_oid(repo, ref_name, target_oid).map_err(AppError::Git)?;
    Ok(())
}

/// Deletes a hidden ref created by `pin_object`/the snapshot commands. Idempotent —
/// no error if the ref is already gone.
pub fn unpin_object(repo: &Repository, ref_name: &str) {
    if let Ok(mut reference) = repo.find_reference(&pin_ref_name(ref_name)) {
        let _ = reference.delete();
    }
}

/// Checks whether each OID exists in the local object database (without loading its content).
/// Used at startup to invalidate persisted history entries whose object has
/// disappeared (e.g. a manual `git gc` run outside the app).
pub fn objects_exist(repo: &Repository, oids: &[String]) -> Result<Vec<bool>, String> {
    let odb = repo.odb().map_err(AppError::Git)?;
    Ok(oids
        .iter()
        .map(|oid_str| {
            Oid::from_str(oid_str)
                .map(|oid| odb.exists(oid))
                .unwrap_or(false)
        })
        .collect())
}

// ─── Orphan file (used before discard_file_changes) ──────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshotResult {
    pub blob_oid: String,
    pub ref_name: String,
}

/// Writes a file's content as a Git blob and immediately pins the object via a hidden
/// ref (`refs/git-manager/undo/<entry_id>`) so it survives indefinitely while the
/// history entry exists. Returns `None` if the file doesn't exist (nothing to save).
pub fn snapshot_file(
    repo: &Repository,
    full_path: &Path,
    entry_id: &str,
) -> Result<Option<FileSnapshotResult>, String> {
    if !full_path.is_file() {
        return Ok(None);
    }

    let bytes = fs::read(full_path).map_err(AppError::Io)?;
    let oid = repo.blob(&bytes).map_err(AppError::Git)?;
    pin_oid(repo, entry_id, oid).map_err(AppError::Git)?;

    Ok(Some(FileSnapshotResult {
        blob_oid: oid.to_string(),
        ref_name: entry_id.to_string(),
    }))
}

/// Rewrites a file to disk from an orphan blob captured by `snapshot_file`.
pub fn restore_file_blob(
    repo: &Repository,
    full_path: &Path,
    blob_oid: &str,
) -> Result<(), String> {
    let oid = Oid::from_str(blob_oid).map_err(AppError::Git)?;
    let blob = repo.find_blob(oid).map_err(AppError::Git)?;

    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(AppError::Io)?;
    }
    fs::write(full_path, blob.content()).map_err(AppError::Io)?;

    Ok(())
}

// ─── Full worktree snapshot (used before reset hard / forced checkout / stash pop-apply) ─────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeSnapshot {
    pub index_tree_oid: String,
    pub workdir_tree_oid: String,
    pub index_ref_name: String,
    pub workdir_ref_name: String,
}

fn build_worktree_snapshot(
    repo: &Repository,
    entry_id: &str,
) -> Result<WorktreeSnapshot, git2::Error> {
    let index_tree_oid = {
        let mut index = repo.index()?;
        index.write_tree()?
    };

    let workdir_tree_oid = {
        let mut index = repo.index()?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.write_tree()?
    };

    let index_ref_name = format!("{entry_id}/index");
    let workdir_ref_name = format!("{entry_id}/workdir");
    pin_oid(repo, &index_ref_name, index_tree_oid)?;
    pin_oid(repo, &workdir_ref_name, workdir_tree_oid)?;

    Ok(WorktreeSnapshot {
        index_tree_oid: index_tree_oid.to_string(),
        workdir_tree_oid: workdir_tree_oid.to_string(),
        index_ref_name,
        workdir_ref_name,
    })
}

/// Captures the current state of the index (staged) and the working directory (staged +
/// unstaged + untracked) as two Git trees, pinned via hidden refs. Returns `None` if
/// the repo is already clean (nothing to protect before a destructive action like
/// reset --hard or a forced checkout).
pub fn snapshot_worktree_if_dirty(
    repo: &Repository,
    entry_id: &str,
) -> Result<Option<WorktreeSnapshot>, String> {
    let mut status_opts = git2::StatusOptions::new();
    status_opts
        .include_untracked(true)
        .recurse_untracked_dirs(true);
    let statuses = repo
        .statuses(Some(&mut status_opts))
        .map_err(AppError::Git)?;
    if statuses.is_empty() {
        return Ok(None);
    }

    build_worktree_snapshot(repo, entry_id)
        .map(Some)
        .map_err(AppError::Git)
        .map_err(String::from)
}

/// Like `snapshot_worktree_if_dirty`, but always captures (even if the workdir is clean) — used
/// for the stash apply/pop undo, where the "clean" baseline is itself the state to restore.
pub fn snapshot_worktree_always(
    repo: &Repository,
    entry_id: &str,
) -> Result<WorktreeSnapshot, String> {
    build_worktree_snapshot(repo, entry_id)
        .map_err(AppError::Git)
        .map_err(String::from)
}

/// Restores a snapshot captured by `snapshot_worktree_if_dirty`/`snapshot_worktree_always`: the
/// working directory is put back into the exact state of the "workdir" tree (extra untracked
/// files removed), and the index is put back into the exact state of the "index" tree (preserving
/// the original staged/unstaged distinction).
pub fn restore_worktree_snapshot(
    repo: &Repository,
    index_tree_oid: &str,
    workdir_tree_oid: &str,
) -> Result<(), String> {
    let workdir_oid = Oid::from_str(workdir_tree_oid).map_err(AppError::Git)?;
    let workdir_tree = repo.find_tree(workdir_oid).map_err(AppError::Git)?;

    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.force();
    checkout_opts.remove_untracked(true);
    repo.checkout_tree(workdir_tree.as_object(), Some(&mut checkout_opts))
        .map_err(AppError::Git)?;

    let index_oid = Oid::from_str(index_tree_oid).map_err(AppError::Git)?;
    let index_tree = repo.find_tree(index_oid).map_err(AppError::Git)?;
    let mut index = repo.index().map_err(AppError::Git)?;
    index.read_tree(&index_tree).map_err(AppError::Git)?;
    index.write().map_err(AppError::Git)?;

    Ok(())
}

// ─── recreate_branch_ref (used for the delete_branch undo) ───────────────────

/// Recreates a local branch ref pointing at a given OID, with an optional upstream.
/// Internal utility for the `delete_branch` undo — does not implement the generic
/// `create_branch` command expected elsewhere by the UI (out of scope, see the plan).
pub fn recreate_branch_ref(
    repo: &Repository,
    name: &str,
    oid: &str,
    upstream: Option<&str>,
) -> Result<(), String> {
    let target_oid = Oid::from_str(oid).map_err(AppError::Git)?;
    let commit = repo.find_commit(target_oid).map_err(AppError::Git)?;
    let mut branch = repo.branch(name, &commit, false).map_err(AppError::Git)?;

    if let Some(upstream_name) = upstream {
        let _ = branch.set_upstream(Some(upstream_name));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::build::CheckoutBuilder;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-undo-{}-{}-{}",
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

    /// A repo with one commit (`a.txt` = "v1") checked out to disk.
    fn repo_with_initial_commit(name: &str) -> (std::path::PathBuf, Repository) {
        let dir = temp_dir(name);
        let repo = Repository::init(&dir).unwrap();
        fs::write(dir.join("a.txt"), "v1").unwrap();

        let sig = git2::Signature::now("Test", "test@example.com").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("a.txt")).unwrap();
        let tree_oid = index.write_tree().unwrap();
        index.write().unwrap();
        {
            let tree = repo.find_tree(tree_oid).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
                .unwrap();
        }
        repo.checkout_head(Some(CheckoutBuilder::new().force()))
            .unwrap();

        (dir, repo)
    }

    fn file_contents(dir: &Path, name: &str) -> Option<String> {
        fs::read_to_string(dir.join(name)).ok()
    }

    fn blob_content_at_path(repo: &Repository, tree_oid: Oid, path: &str) -> Option<String> {
        let tree = repo.find_tree(tree_oid).ok()?;
        let entry = tree.get_path(Path::new(path)).ok()?;
        let blob = repo.find_blob(entry.id()).ok()?;
        Some(String::from_utf8(blob.content().to_vec()).unwrap())
    }

    #[test]
    fn worktree_snapshot_separates_index_from_workdir_and_includes_untracked() {
        let (dir, repo) = repo_with_initial_commit("snapshot-separate");

        // Stage a.txt = "v2", then edit it further on disk without staging (v3), and
        // add an untracked file — the index and workdir snapshots must diverge.
        fs::write(dir.join("a.txt"), "v2").unwrap();
        repo.index().unwrap().add_path(Path::new("a.txt")).unwrap();
        repo.index().unwrap().write().unwrap();
        fs::write(dir.join("a.txt"), "v3").unwrap();
        fs::write(dir.join("untracked.txt"), "u1").unwrap();

        let snapshot = snapshot_worktree_always(&repo, "entry1").unwrap();

        let index_oid = Oid::from_str(&snapshot.index_tree_oid).unwrap();
        let workdir_oid = Oid::from_str(&snapshot.workdir_tree_oid).unwrap();

        assert_eq!(
            blob_content_at_path(&repo, index_oid, "a.txt"),
            Some("v2".to_string())
        );
        assert_eq!(
            blob_content_at_path(&repo, index_oid, "untracked.txt"),
            None,
            "the index snapshot must not contain an untracked file"
        );
        assert_eq!(
            blob_content_at_path(&repo, workdir_oid, "a.txt"),
            Some("v3".to_string())
        );
        assert_eq!(
            blob_content_at_path(&repo, workdir_oid, "untracked.txt"),
            Some("u1".to_string())
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn restoring_a_snapshot_puts_back_workdir_and_index_and_removes_new_untracked_files() {
        let (dir, repo) = repo_with_initial_commit("snapshot-restore");

        fs::write(dir.join("a.txt"), "v2").unwrap();
        repo.index().unwrap().add_path(Path::new("a.txt")).unwrap();
        repo.index().unwrap().write().unwrap();
        fs::write(dir.join("a.txt"), "v3").unwrap();
        fs::write(dir.join("untracked.txt"), "u1").unwrap();

        let snapshot = snapshot_worktree_always(&repo, "entry1").unwrap();

        // Further destroy the state after the snapshot: different content, a new
        // untracked file, and the previously-untracked file changed too.
        fs::write(dir.join("a.txt"), "v4").unwrap();
        fs::write(dir.join("untracked.txt"), "u2").unwrap();
        fs::write(dir.join("extra.txt"), "e1").unwrap();

        restore_worktree_snapshot(&repo, &snapshot.index_tree_oid, &snapshot.workdir_tree_oid)
            .unwrap();

        assert_eq!(file_contents(&dir, "a.txt"), Some("v3".to_string()));
        assert_eq!(file_contents(&dir, "untracked.txt"), Some("u1".to_string()));
        assert_eq!(
            file_contents(&dir, "extra.txt"),
            None,
            "a file created after the snapshot must be removed as untracked"
        );

        // The staged/unstaged distinction must survive the restore: the index still
        // holds the older "v2", separate from the "v3" now on disk.
        let index_entry_oid = repo
            .index()
            .unwrap()
            .get_path(Path::new("a.txt"), 0)
            .unwrap()
            .id;
        let staged_blob = repo.find_blob(index_entry_oid).unwrap();
        assert_eq!(staged_blob.content(), b"v2");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn snapshot_if_dirty_returns_none_on_a_clean_repo() {
        let (dir, repo) = repo_with_initial_commit("snapshot-clean");

        let result = snapshot_worktree_if_dirty(&repo, "entry1").unwrap();

        assert!(result.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn snapshot_if_dirty_captures_when_there_are_untracked_files() {
        let (dir, repo) = repo_with_initial_commit("snapshot-dirty");
        fs::write(dir.join("untracked.txt"), "u1").unwrap();

        let result = snapshot_worktree_if_dirty(&repo, "entry1").unwrap();

        assert!(result.is_some());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn pin_and_unpin_object_round_trip() {
        let (dir, repo) = repo_with_initial_commit("pin-roundtrip");
        let oid = repo.blob(b"payload").unwrap();

        pin_object(&repo, "my-entry", &oid.to_string()).unwrap();
        assert!(repo.find_reference(&pin_ref_name("my-entry")).is_ok());

        unpin_object(&repo, "my-entry");
        assert!(repo.find_reference(&pin_ref_name("my-entry")).is_err());

        // Idempotent: unpinning an already-gone ref must not error.
        unpin_object(&repo, "my-entry");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn objects_exist_reports_presence_per_oid() {
        let (dir, repo) = repo_with_initial_commit("objects-exist");
        let existing = repo.blob(b"payload").unwrap().to_string();
        let missing = "0".repeat(40);
        let malformed = "not-an-oid".to_string();

        let results = objects_exist(&repo, &[existing, missing, malformed]).unwrap();

        assert_eq!(results, vec![true, false, false]);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn snapshot_and_restore_file_blob_round_trip() {
        let (dir, repo) = repo_with_initial_commit("file-blob");
        let source = dir.join("a.txt");

        let snapshot = snapshot_file(&repo, &source, "file-entry")
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.ref_name, "file-entry");

        let restore_target = dir.join("nested").join("restored.txt");
        restore_file_blob(&repo, &restore_target, &snapshot.blob_oid).unwrap();

        assert_eq!(
            fs::read_to_string(&restore_target).unwrap(),
            "v1",
            "restored content must match the snapshotted file, including a missing parent dir"
        );

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn snapshot_file_returns_none_for_a_missing_file() {
        let (dir, repo) = repo_with_initial_commit("file-missing");

        let result = snapshot_file(&repo, &dir.join("does-not-exist.txt"), "entry").unwrap();

        assert!(result.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn recreate_branch_ref_points_at_the_given_oid() {
        let (dir, repo) = repo_with_initial_commit("recreate-branch");
        let head_oid = repo.head().unwrap().peel_to_commit().unwrap().id();

        recreate_branch_ref(&repo, "resurrected", &head_oid.to_string(), None).unwrap();

        let branch = repo
            .find_branch("resurrected", git2::BranchType::Local)
            .unwrap();
        assert_eq!(branch.get().peel_to_commit().unwrap().id(), head_oid);

        std::fs::remove_dir_all(&dir).ok();
    }
}
