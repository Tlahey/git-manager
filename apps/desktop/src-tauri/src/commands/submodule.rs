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

// ─── Commande ─────────────────────────────────────────────────────────────────

/// Liste les sous-modules du dépôt
#[tauri::command]
pub async fn list_submodules(path: String) -> Result<Vec<GitSubmodule>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;

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
