use crate::error::AppError;
use git2::{Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

// ─── Types de résultat ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub remote: String,
    pub updated_refs: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub fast_forwarded: bool,
    pub commits_merged: usize,
    pub conflicts: Vec<String>,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn make_auth_callbacks<'a>() -> RemoteCallbacks<'a> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|_url, username_from_url, _allowed_types| {
        Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
    });
    callbacks
}

fn resolve_remote_name(repo: &Repository, remote: Option<String>) -> String {
    let name_or_url = match remote {
        Some(name) => name,
        None => return "origin".to_string(),
    };
    if let Ok(remotes) = repo.remotes() {
        for r_name in remotes.iter().flatten() {
            if let Ok(r) = repo.find_remote(r_name) {
                if r.url() == Some(&name_or_url) {
                    return r_name.to_string();
                }
            }
        }
    }
    name_or_url
}

// ─── fetch_remote ─────────────────────────────────────────────────────────────

/// Fetch depuis un remote (défaut : "origin")
#[tauri::command]
pub async fn fetch_remote(path: String, remote: Option<String>) -> Result<FetchResult, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let remote_name = resolve_remote_name(&repo, remote);
    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let updated_refs: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let updated_refs_clone = Arc::clone(&updated_refs);

    let mut callbacks = make_auth_callbacks();
    callbacks.update_tips(move |refname, old_oid, new_oid| {
        if old_oid != new_oid {
            let short_new = new_oid.to_string();
            let short_new = &short_new[..7.min(short_new.len())];
            updated_refs_clone
                .lock()
                .unwrap()
                .push(format!("{refname} → {short_new}"));
        }
        true
    });

    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);

    let refspec = format!("+refs/heads/*:refs/remotes/{remote_name}/*");
    remote_obj
        .fetch(&[refspec.as_str()], Some(&mut fetch_opts), None)
        .map_err(AppError::Git)?;

    let refs = updated_refs.lock().unwrap().clone();

    Ok(FetchResult {
        remote: remote_name,
        updated_refs: refs,
    })
}

// ─── pull_branch ──────────────────────────────────────────────────────────────

/// Pull (fetch + merge fast-forward ou rebase)
#[tauri::command]
pub async fn pull_branch(
    path: String,
    remote: Option<String>,
    rebase: Option<bool>,
) -> Result<PullResult, String> {
    // 1. Fetch
    fetch_remote(path.clone(), remote.clone()).await?;

    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let remote_name = resolve_remote_name(&repo, remote);

    // 2. Branche courante
    let head = repo.head().map_err(AppError::Git)?;
    if !head.is_branch() {
        return Err(String::from(AppError::Unknown(
            "HEAD n'est pas sur une branche".to_string(),
        )));
    }
    let branch_name = head
        .shorthand()
        .ok_or_else(|| String::from(AppError::Unknown("Impossible de lire le nom de la branche".to_string())))?
        .to_string();

    // 3. Ref de tracking distant
    let remote_ref_name = format!("refs/remotes/{remote_name}/{branch_name}");
    let remote_ref = match repo.find_reference(&remote_ref_name) {
        Ok(r) => r,
        Err(_) => {
            return Ok(PullResult {
                fast_forwarded: false,
                commits_merged: 0,
                conflicts: vec![],
            })
        }
    };

    let remote_oid = match remote_ref.target() {
        Some(oid) => oid,
        None => {
            return Ok(PullResult {
                fast_forwarded: false,
                commits_merged: 0,
                conflicts: vec![],
            })
        }
    };

    let head_oid = head
        .target()
        .ok_or_else(|| String::from(AppError::Unknown("HEAD has no target".to_string())))?;

    if head_oid == remote_oid {
        // Déjà à jour
        return Ok(PullResult {
            fast_forwarded: false,
            commits_merged: 0,
            conflicts: vec![],
        });
    }

    // 4. Vérifier si fast-forward possible
    let merge_base = repo
        .merge_base(head_oid, remote_oid)
        .map_err(AppError::Git)?;

    if merge_base == head_oid {
        // Fast-forward possible
        let head_ref_name = head
            .name()
            .ok_or_else(|| String::from(AppError::Unknown("HEAD ref name invalid".to_string())))?
            .to_string();

        // Compter les commits qui arrivent
        let mut walk = repo.revwalk().map_err(AppError::Git)?;
        walk.push(remote_oid).map_err(AppError::Git)?;
        walk.hide(head_oid).map_err(AppError::Git)?;
        let commits_count = walk.count();

        // Avancer la ref locale
        let mut local_ref = repo
            .find_reference(&head_ref_name)
            .map_err(AppError::Git)?;
        local_ref
            .set_target(remote_oid, "pull: Fast-forward")
            .map_err(AppError::Git)?;

        // Mettre à jour le working tree
        let remote_commit = repo.find_commit(remote_oid).map_err(AppError::Git)?;
        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.safe();
        repo.checkout_tree(remote_commit.as_object(), Some(&mut checkout_opts))
            .map_err(AppError::Git)?;

        Ok(PullResult {
            fast_forwarded: true,
            commits_merged: commits_count,
            conflicts: vec![],
        })
    } else if rebase.unwrap_or(false) {
        Err(String::from(AppError::Unknown(
            "Le rebase pull n'est pas encore implémenté. Utilisez le merge fast-forward.".to_string(),
        )))
    } else {
        // Merge nécessaire — détecter les conflits potentiels
        let statuses = repo.statuses(None).map_err(AppError::Git)?;
        let conflicts: Vec<String> = statuses
            .iter()
            .filter(|e| e.status().contains(git2::Status::CONFLICTED))
            .map(|e| e.path().unwrap_or("").to_string())
            .collect();

        Ok(PullResult {
            fast_forwarded: false,
            commits_merged: 0,
            conflicts,
        })
    }
}

// ─── push_branch ──────────────────────────────────────────────────────────────

/// Push vers le remote
#[tauri::command]
pub async fn push_branch(
    path: String,
    remote: Option<String>,
    force: Option<bool>,
) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let remote_name = resolve_remote_name(&repo, remote);

    let head = repo.head().map_err(AppError::Git)?;
    let branch_name = head
        .shorthand()
        .ok_or_else(|| String::from(AppError::Unknown("HEAD n'est pas sur une branche".to_string())))?
        .to_string();

    let prefix = if force.unwrap_or(false) { "+" } else { "" };
    let refspec = format!("{prefix}refs/heads/{branch_name}:refs/heads/{branch_name}");

    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let callbacks = make_auth_callbacks();
    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    remote_obj
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(AppError::Git)?;

    Ok(())
}

// ─── get_remotes ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
    pub push_url: Option<String>,
}

/// Liste les remotes avec leur nom (GitRepo.remotes ne fournit que les URLs)
#[tauri::command]
pub async fn get_remotes(path: String) -> Result<Vec<RemoteInfo>, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    let mut remotes = Vec::new();

    let names = repo.remotes().map_err(AppError::Git)?;
    for name in names.iter().flatten() {
        if let Ok(remote) = repo.find_remote(name) {
            remotes.push(RemoteInfo {
                name: name.to_string(),
                url: remote.url().unwrap_or("").to_string(),
                push_url: remote.pushurl().map(|s| s.to_string()),
            });
        }
    }

    Ok(remotes)
}

// ─── remove_remote ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn remove_remote(path: String, name: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    repo.remote_delete(&name).map_err(AppError::Git)?;
    Ok(())
}

// ─── add_remote ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn add_remote(path: String, name: String, url: String) -> Result<(), String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    repo.remote(&name, &url).map_err(AppError::Git)?;
    Ok(())
}
