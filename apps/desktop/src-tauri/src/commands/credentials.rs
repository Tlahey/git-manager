//! The keychain's IPC surface — deliberately **write-only**.
//!
//! Store, delete, ask whether one exists. There is no `get_credential` command and there must never
//! be one: `services/credential_store.rs` explains why at length, but the short version is that the
//! frontend having no way to *read* a secret is the whole point of moving them here. Anything that
//! needs a token — the GitHub proxy, the AI provider — reads it in Rust and puts it on the wire
//! without it ever crossing the IPC boundary.
//!
//! The write commands exist because a secret has to get in somehow: a personal access token the user
//! pastes, or an AI API key typed into Settings, both arrive in the webview by definition. That
//! one-way trip is unavoidable; a way back out is not.

use crate::services::credential_store::{self, CredentialKind};

/// Stores (or replaces) a secret for one account. An empty `secret` clears it — see `set_secret`.
#[tauri::command]
pub fn store_credential(kind: String, id: String, secret: String) -> Result<(), String> {
    let kind = CredentialKind::parse(&kind)?;
    credential_store::set_secret(kind, &id, &secret)?;
    Ok(())
}

/// Removes an account's secret — what disconnecting an account does.
#[tauri::command]
pub fn delete_credential(kind: String, id: String) -> Result<(), String> {
    let kind = CredentialKind::parse(&kind)?;
    credential_store::delete_secret(kind, &id)?;
    Ok(())
}

/// Whether a secret is stored for this account.
///
/// Safe to expose where a read is not: the answer is a boolean, and the frontend genuinely needs it
/// — an account can be listed in `settings.json` with nothing behind it in the keychain (a keychain
/// item revoked by hand, a settings file copied to another machine), and the UI has to be able to
/// say "reconnect this account" instead of firing a request that will come back 401.
#[tauri::command]
pub fn has_credential(kind: String, id: String) -> Result<bool, String> {
    let kind = CredentialKind::parse(&kind)?;
    Ok(credential_store::has_secret(kind, &id)?)
}
