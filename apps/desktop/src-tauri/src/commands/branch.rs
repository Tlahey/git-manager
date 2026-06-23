use crate::error::AppError;
use crate::models::GitBranch;
use git2::Repository;
use serde::{Deserialize, Serialize};

// ─── Struct local pour GitRef avec le bon nom de champ "type" ────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchRef {
    pub name: String,
    pub short_name: String,
    #[serde(rename = "type")]
    pub ref_type: String,
    pub commit_oid: String,
}

// ─── Commandes Tauri ──────────────────────────────────────────────────────────

/// Retourne la liste des branches (locales et/ou distantes)
#[tauri::command]
pub async fn get_branches(
    path: String,
    include_remote: Option<bool>,
) -> Result<Vec<GitBranch>, String> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let include_remote = include_remote.unwrap_or(true);

    let branch_filter = if include_remote {
        None // toutes les branches (locales + distantes)
    } else {
        Some(git2::BranchType::Local)
    };

    let mut branches: Vec<GitBranch> = Vec::new();

    for branch_result in repo.branches(branch_filter).map_err(|e| AppError::Git(e))? {
        let (branch, branch_type) = branch_result.map_err(|e| AppError::Git(e))?;
        let is_remote = branch_type == git2::BranchType::Remote;

        // Nom de la branche
        let name = branch
            .name()
            .map_err(|e| AppError::Git(e))?
            .unwrap_or("")
            .to_string();

        if name.is_empty() {
            continue;
        }

        // Nom court (strip préfixe remote si applicable)
        let short_name = if is_remote {
            name.splitn(2, '/').nth(1).unwrap_or(&name).to_string()
        } else {
            name.clone()
        };

        // OID du commit de tête de branche
        let reference = branch.get();
        let commit_oid = match reference.target() {
            Some(oid) => oid,
            None => continue, // référence symbolique sans target direct
        };
        let commit_oid_str = commit_oid.to_string();

        let commit = match repo.find_commit(commit_oid) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let commit_message = commit
            .message()
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("")
            .to_string();

        let commit_timestamp = commit.time().seconds();
        let is_head = branch.is_head();

        // Ahead / Behind vs upstream (branches locales uniquement)
        let (upstream_name, ahead_count, behind_count) = if !is_remote {
            match branch.upstream() {
                Ok(upstream_branch) => {
                    let up_name = upstream_branch
                        .name()
                        .ok()
                        .flatten()
                        .map(|n| n.to_string());

                    let up_oid = upstream_branch.get().target();
                    if let Some(up_oid) = up_oid {
                        let (ahead, behind) = repo
                            .graph_ahead_behind(commit_oid, up_oid)
                            .unwrap_or((0, 0));
                        (up_name, ahead, behind)
                    } else {
                        (up_name, 0, 0)
                    }
                }
                Err(_) => (None, 0, 0),
            }
        } else {
            (None, 0, 0)
        };

        branches.push(GitBranch {
            name: name.clone(),
            short_name,
            is_head,
            is_remote,
            upstream: upstream_name,
            commit_oid: commit_oid_str,
            commit_message,
            commit_timestamp,
            ahead_count,
            behind_count,
        });
    }

    // Trier : HEAD en premier, puis locales par nom, puis distantes
    branches.sort_by(|a, b| {
        b.is_head
            .cmp(&a.is_head)
            .then(a.is_remote.cmp(&b.is_remote))
            .then(a.short_name.cmp(&b.short_name))
    });

    Ok(branches)
}

/// Retourne la liste de tous les tags du dépôt
#[tauri::command]
pub async fn get_tags(path: String) -> Result<Vec<BranchRef>, String> {
    let repo = Repository::open(&path).map_err(|e| AppError::Git(e))?;
    let mut tags: Vec<BranchRef> = Vec::new();

    let tag_names = repo.tag_names(None).map_err(|e| AppError::Git(e))?;

    for tag_name in tag_names.iter().flatten() {
        let full_ref_name = format!("refs/tags/{}", tag_name);
        let reference = match repo.find_reference(&full_ref_name) {
            Ok(r) => r,
            Err(_) => continue,
        };

        // Déréférencer les tags annotés pour obtenir l'OID du commit
        let commit_oid = match reference.peel_to_commit() {
            Ok(c) => c.id(),
            Err(_) => match reference.target() {
                Some(oid) => oid,
                None => continue,
            },
        };

        tags.push(BranchRef {
            name: full_ref_name,
            short_name: tag_name.to_string(),
            ref_type: "tag".to_string(),
            commit_oid: commit_oid.to_string(),
        });
    }

    // Trier par nom de tag
    tags.sort_by(|a, b| a.short_name.cmp(&b.short_name));

    Ok(tags)
}
