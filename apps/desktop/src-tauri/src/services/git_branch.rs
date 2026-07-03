use crate::error::AppError;
use crate::models::GitBranch;
use git2::{Oid, Repository};
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

/// Retourne la liste des branches (locales et/ou distantes)
pub fn list_branches(repo: &Repository, include_remote: bool) -> Result<Vec<GitBranch>, AppError> {
    let branch_filter = if include_remote {
        None // toutes les branches (locales + distantes)
    } else {
        Some(git2::BranchType::Local)
    };

    let mut branches: Vec<GitBranch> = Vec::new();

    for branch_result in repo.branches(branch_filter).map_err(AppError::Git)? {
        let (branch, branch_type) = branch_result.map_err(AppError::Git)?;
        let is_remote = branch_type == git2::BranchType::Remote;

        // Nom de la branche
        let name = branch
            .name()
            .map_err(AppError::Git)?
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
                    let up_name = upstream_branch.name().ok().flatten().map(|n| n.to_string());

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
pub fn list_tags(repo: &Repository) -> Result<Vec<BranchRef>, AppError> {
    let mut tags: Vec<BranchRef> = Vec::new();

    let tag_names = repo.tag_names(None).map_err(AppError::Git)?;

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

/// Crée une nouvelle branche locale pointant sur `from_ref`, sans la checkout.
/// `from_ref` accepte tout revspec résolu par git2 (nom de branche, "HEAD", OID complet).
pub fn create_branch(repo: &Repository, name: &str, from_ref: &str) -> Result<(), AppError> {
    let obj = repo
        .revparse_single(from_ref)
        .map_err(|_| AppError::Unknown(format!("Invalid reference: {from_ref}")))?;
    let commit = obj.peel_to_commit().map_err(AppError::Git)?;
    repo.branch(name, &commit, false).map_err(AppError::Git)?;
    Ok(())
}

/// Checkout d'une branche locale par son nom, ou d'un commit brut par OID (HEAD détaché).
/// Le fallback OID permet de restaurer un HEAD détaché lors d'un undo de checkout.
pub fn checkout_branch(repo: &Repository, ref_name: &str, force: bool) -> Result<(), AppError> {
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    if force {
        checkout_opts.force();
    } else {
        checkout_opts.safe();
    }

    if let Ok(branch) = repo.find_branch(ref_name, git2::BranchType::Local) {
        let reference = branch.into_reference();
        let commit = reference.peel_to_commit().map_err(AppError::Git)?;
        repo.checkout_tree(commit.as_object(), Some(&mut checkout_opts))
            .map_err(AppError::Git)?;
        let ref_full_name = reference
            .name()
            .ok_or_else(|| AppError::Unknown("Invalid branch ref name".to_string()))?;
        repo.set_head(ref_full_name).map_err(AppError::Git)?;
        return Ok(());
    }

    // Pas une branche locale : tenter un OID brut (checkout détaché)
    let oid = Oid::from_str(ref_name)
        .map_err(|_| AppError::Unknown(format!("Branch not found: {ref_name}")))?;
    let commit = repo.find_commit(oid).map_err(AppError::Git)?;
    repo.checkout_tree(commit.as_object(), Some(&mut checkout_opts))
        .map_err(AppError::Git)?;
    repo.set_head_detached(oid).map_err(AppError::Git)?;
    Ok(())
}

/// Supprime une branche locale (et sa branche de tracking distante si demandé).
/// `force = false` refuse la suppression si la branche n'est pas fusionnée dans HEAD
/// (équivalent `git branch -d`) ; `force = true` supprime sans vérification (`-D`).
pub fn delete_branch(
    repo: &Repository,
    name: &str,
    force: bool,
    delete_remote: bool,
) -> Result<(), AppError> {
    let mut branch = repo
        .find_branch(name, git2::BranchType::Local)
        .map_err(AppError::Git)?;

    if !force {
        if let (Ok(head), Some(branch_oid)) = (repo.head(), branch.get().target()) {
            if let Some(head_oid) = head.target() {
                let is_merged = head_oid == branch_oid
                    || repo
                        .graph_descendant_of(head_oid, branch_oid)
                        .unwrap_or(false);
                if !is_merged {
                    return Err(AppError::Unknown(format!(
                        "Branch '{name}' is not fully merged"
                    )));
                }
            }
        }
    }

    let upstream_name = branch
        .upstream()
        .ok()
        .and_then(|u| u.name().ok().flatten().map(|n| n.to_string()));

    branch.delete().map_err(AppError::Git)?;

    if delete_remote {
        if let Some(upstream_name) = upstream_name {
            if let Ok(mut remote_branch) =
                repo.find_branch(&upstream_name, git2::BranchType::Remote)
            {
                let _ = remote_branch.delete();
            }
        }
    }

    Ok(())
}
