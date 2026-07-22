use crate::error::AppError;
use crate::utils::short_oid;
use git2::{Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

// ─── Result types ─────────────────────────────────────────────────────────────

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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
    pub push_url: Option<String>,
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

// ─── fetch ────────────────────────────────────────────────────────────────────

/// Fetch from a remote (defaults to "origin")
pub fn fetch(
    repo: &Repository,
    remote: Option<String>,
    prune: bool,
) -> Result<FetchResult, AppError> {
    let remote_name = resolve_remote_name(repo, remote);
    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let updated_refs: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let updated_refs_clone = Arc::clone(&updated_refs);

    let mut callbacks = make_auth_callbacks();
    callbacks.update_tips(move |refname, old_oid, new_oid| {
        if old_oid != new_oid {
            let short_new = new_oid.to_string();
            let short_new = short_oid(&short_new);
            updated_refs_clone
                .lock()
                .unwrap()
                .push(format!("{refname} → {short_new}"));
        }
        true
    });

    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(callbacks);
    if prune {
        fetch_opts.prune(git2::FetchPrune::On);
    }

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

// ─── pull ─────────────────────────────────────────────────────────────────────

/// Pull (fetch + merge fast-forward ou rebase)
pub fn pull(
    repo: &Repository,
    remote: Option<String>,
    rebase: bool,
) -> Result<PullResult, AppError> {
    // 1. Fetch
    fetch(repo, remote.clone(), false)?;

    let remote_name = resolve_remote_name(repo, remote);

    // 2. Branche courante
    let head = repo.head().map_err(AppError::Git)?;
    if !head.is_branch() {
        return Err(AppError::Unknown(
            "HEAD n'est pas sur une branche".to_string(),
        ));
    }
    let branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::Unknown("Impossible de lire le nom de la branche".to_string()))?
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
        .ok_or_else(|| AppError::Unknown("HEAD has no target".to_string()))?;

    if head_oid == remote_oid {
        // Already up to date
        return Ok(PullResult {
            fast_forwarded: false,
            commits_merged: 0,
            conflicts: vec![],
        });
    }

    // 4. Check whether a fast-forward is possible
    let merge_base = repo
        .merge_base(head_oid, remote_oid)
        .map_err(AppError::Git)?;

    if merge_base == head_oid {
        // Fast-forward possible
        let head_ref_name = head
            .name()
            .ok_or_else(|| AppError::Unknown("HEAD ref name invalid".to_string()))?
            .to_string();

        // Count the incoming commits
        let mut walk = repo.revwalk().map_err(AppError::Git)?;
        walk.push(remote_oid).map_err(AppError::Git)?;
        walk.hide(head_oid).map_err(AppError::Git)?;
        let commits_count = walk.count();

        // Advance the local ref
        let mut local_ref = repo.find_reference(&head_ref_name).map_err(AppError::Git)?;
        local_ref
            .set_target(remote_oid, "pull: Fast-forward")
            .map_err(AppError::Git)?;

        // Update the working tree
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
    } else if rebase {
        Err(AppError::Unknown(
            "Rebase pull is not implemented yet. Use fast-forward merge.".to_string(),
        ))
    } else {
        // Merge needed — detect potential conflicts
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

// ─── push ─────────────────────────────────────────────────────────────────────

/// Push to the remote
pub fn push(repo: &Repository, remote: Option<String>, force: bool) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    let head = repo.head().map_err(AppError::Git)?;
    let branch_name = head
        .shorthand()
        .ok_or_else(|| AppError::Unknown("HEAD n'est pas sur une branche".to_string()))?
        .to_string();

    let prefix = if force { "+" } else { "" };
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

/// Pushes local branch `source` to remote branch `target` on `remote` (refspec `source:target`) —
/// used by the drag-and-drop of one ref badge onto another. Reuses the same auth callbacks as
/// `push` to keep credentials on the Rust side.
pub fn push_to(
    repo: &Repository,
    remote: Option<String>,
    source: &str,
    target: &str,
    force: bool,
) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    let prefix = if force { "+" } else { "" };
    let refspec = format!("{prefix}refs/heads/{source}:refs/heads/{target}");

    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let callbacks = make_auth_callbacks();
    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    remote_obj
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(AppError::Git)?;

    Ok(())
}

/// Deletes tag `tag_name` on `remote` (defaults to "origin") by pushing an empty-source
/// refspec (`:refs/tags/<name>`), the porcelain equivalent of `git push origin :refs/tags/<name>`.
/// Reuses the same auth callbacks as `push` to keep credentials on the Rust side.
pub fn delete_remote_tag(
    repo: &Repository,
    remote: Option<String>,
    tag_name: &str,
) -> Result<(), AppError> {
    let remote_name = resolve_remote_name(repo, remote);

    let refspec = format!(":refs/tags/{tag_name}");

    let mut remote_obj = repo.find_remote(&remote_name).map_err(AppError::Git)?;

    let callbacks = make_auth_callbacks();
    let mut push_opts = PushOptions::new();
    push_opts.remote_callbacks(callbacks);

    remote_obj
        .push(&[refspec.as_str()], Some(&mut push_opts))
        .map_err(AppError::Git)?;

    Ok(())
}

// ─── remotes CRUD ─────────────────────────────────────────────────────────────

/// Lists the remotes with their name (GitRepo.remotes only exposes the URLs)
pub fn list_remotes(repo: &Repository) -> Result<Vec<RemoteInfo>, AppError> {
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

pub fn remove_remote(repo: &Repository, name: &str) -> Result<(), AppError> {
    repo.remote_delete(name).map_err(AppError::Git)
}

pub fn add_remote(repo: &Repository, name: &str, url: &str) -> Result<(), AppError> {
    repo.remote(name, url).map_err(AppError::Git)?;
    Ok(())
}
