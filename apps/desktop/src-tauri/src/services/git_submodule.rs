use crate::error::AppError;
use git2::Repository;
use serde::{Deserialize, Serialize};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitSubmodule {
    pub path: String,
    pub url: String,
    pub head_oid: String,
}

// ─── Submodules ─────────────────────────────────────────────────────────────

/// Returns the repository's submodules, mapped to their DTO shape.
pub fn list_submodules(repo: &Repository) -> Result<Vec<GitSubmodule>, AppError> {
    let submodules = repo
        .submodules()
        .map_err(AppError::Git)?
        .into_iter()
        .map(|sm| {
            let head_oid = sm.head_id().map(|oid| oid.to_string()).unwrap_or_default();

            GitSubmodule {
                path: sm.path().to_string_lossy().to_string(),
                url: sm.url().unwrap_or("").to_string(),
                head_oid,
            }
        })
        .collect();

    Ok(submodules)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::get_git_signature;

    /// Creates a temporary repository with an initial commit (same template used by
    /// `git_branch.rs`'s tests — no dedicated test dependency in this workspace).
    fn init_repo_with_commit(name: &str) -> (std::path::PathBuf, Repository) {
        let dir =
            std::env::temp_dir().join(format!("gm-test-submodule-{}-{}", name, std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        let sig = get_git_signature(&repo).unwrap();
        {
            // `Tree` borrows `repo` and implements `Drop`: its scope must end before `repo` is
            // moved into the return value below.
            let tree_oid = repo.index().unwrap().write_tree().unwrap();
            let tree = repo.find_tree(tree_oid).unwrap();
            repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
                .unwrap();
        }
        (dir, repo)
    }

    #[test]
    fn list_submodules_returns_empty_when_repo_has_none() {
        let (dir, repo) = init_repo_with_commit("none");

        let submodules = list_submodules(&repo).unwrap();

        assert!(submodules.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn list_submodules_maps_path_url_and_head_oid() {
        let (dir, repo) = init_repo_with_commit("with-submodule");

        // Register a submodule entry in `.gitmodules` + the index without needing a real remote
        // to clone from — `Repository::submodules()` reads the config/index state, it doesn't
        // require the submodule's own working tree to be populated.
        let mut submodule = repo
            .submodule("file:///dev/null", std::path::Path::new("vendor/lib"), true)
            .unwrap();
        submodule.init(false).unwrap();

        let submodules = list_submodules(&repo).unwrap();

        assert_eq!(submodules.len(), 1);
        assert_eq!(submodules[0].path, "vendor/lib");
        assert_eq!(submodules[0].url, "file:///dev/null");
        // No commit was ever checked out for the submodule, so it has no HEAD yet.
        assert_eq!(submodules[0].head_oid, "");

        std::fs::remove_dir_all(&dir).ok();
    }
}
