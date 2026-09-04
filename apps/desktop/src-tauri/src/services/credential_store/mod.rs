//! SOLID Credential Storage Service.
//!
//! Stores authentication tokens (GitHub/GitLab/Bitbucket) and AI API keys securely.
//!
//! By default, uses an encrypted local vault (`~/.git-manager/vault.enc`) with AES-256-GCM
//! to avoid macOS security dialog popups on unsigned builds while guaranteeing confidentiality.
//! Can also be configured to use the macOS Keychain or an in-memory test store.

pub mod backend;
pub mod crypto;
pub mod keychain;
pub mod memory;
pub mod vault;

pub use backend::SecretBackend;
pub use keychain::KeychainBackend;
pub use memory::MemoryBackend;
pub use vault::EncryptedVaultBackend;

use crate::error::AppError;
use crate::utils::app_data_dir;
use std::sync::OnceLock;

/// Which kind of secret an entry holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CredentialKind {
    GitHub,
    GitLab,
    Bitbucket,
    /// The configured AI provider's API key.
    Ai,
}

impl CredentialKind {
    /// The wire name, which is also the entry-name prefix.
    pub fn as_str(self) -> &'static str {
        match self {
            CredentialKind::GitHub => "github",
            CredentialKind::GitLab => "gitlab",
            CredentialKind::Bitbucket => "bitbucket",
            CredentialKind::Ai => "ai",
        }
    }

    pub fn parse(value: &str) -> Result<Self, AppError> {
        match value {
            "github" => Ok(CredentialKind::GitHub),
            "gitlab" => Ok(CredentialKind::GitLab),
            "bitbucket" => Ok(CredentialKind::Bitbucket),
            "ai" => Ok(CredentialKind::Ai),
            other => Err(AppError::InvalidInput(format!(
                "Unknown credential kind: {other}"
            ))),
        }
    }
}

/// The single entry id every AI key is stored under.
pub const AI_CREDENTIAL_ID: &str = "provider";

/// The backend type currently selected.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StorageBackendKind {
    Vault,
    Keychain,
    Memory,
}

impl StorageBackendKind {
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            StorageBackendKind::Vault => "vault",
            StorageBackendKind::Keychain => "keychain",
            StorageBackendKind::Memory => "memory",
        }
    }
}

/// The keychain/vault entry name for one credential, e.g. `github:octocat`.
pub fn entry_name(kind: CredentialKind, id: &str) -> Result<String, AppError> {
    let id = id.trim();
    if id.is_empty() {
        return Err(AppError::InvalidInput(
            "A credential id cannot be empty".to_string(),
        ));
    }
    if id.contains(':') {
        return Err(AppError::InvalidInput(
            "A credential id cannot contain ':'".to_string(),
        ));
    }
    Ok(format!("{}:{}", kind.as_str(), id))
}

const DISABLE_ENV: &str = "GIT_MANAGER_NO_KEYCHAIN";
const BACKEND_ENV: &str = "GIT_MANAGER_CREDENTIAL_BACKEND";

fn memory_store_requested_by(value: Option<&str>) -> bool {
    match value.map(str::trim) {
        None | Some("") | Some("0") | Some("false") => false,
        Some(_) => true,
    }
}

/// Detects the target backend kind from configuration & environment.
pub fn active_backend_kind() -> StorageBackendKind {
    if memory_store_requested_by(std::env::var(DISABLE_ENV).ok().as_deref()) {
        return StorageBackendKind::Memory;
    }

    if let Ok(backend_override) = std::env::var(BACKEND_ENV) {
        match backend_override.trim().to_lowercase().as_str() {
            "keychain" => return StorageBackendKind::Keychain,
            "memory" => return StorageBackendKind::Memory,
            "vault" => return StorageBackendKind::Vault,
            _ => {}
        }
    }

    StorageBackendKind::Vault
}

/// Instantiates the active storage backend based on environment and defaults.
///
/// The `Vault` arm's fallback to an in-memory store is the failure that must never be silent again:
/// a memory backend is empty on every launch, so every authenticated call fails while the UI — which
/// reads the *account list* out of `settings.json`, not the credential store — still shows the
/// account as connected. That combination once looked like a broken API layer for a whole debugging
/// session, so it now says so on stderr.
fn init_backend() -> Box<dyn SecretBackend> {
    match active_backend_kind() {
        StorageBackendKind::Memory => Box::new(MemoryBackend::new()),
        StorageBackendKind::Keychain => Box::new(KeychainBackend::new()),
        StorageBackendKind::Vault => {
            match app_data_dir() {
                Some(dir) => match EncryptedVaultBackend::new(dir) {
                    Ok(vault) => return Box::new(vault),
                    Err(e) => eprintln!(
                        "[credentials] Could not open the encrypted vault ({e}). \
                         Falling back to an in-memory store: every stored credential will look \
                         missing until this is fixed."
                    ),
                },
                None => eprintln!(
                    "[credentials] No application data directory is available, so the encrypted \
                     vault cannot be opened. Falling back to an in-memory store: every stored \
                     credential will look missing until this is fixed."
                ),
            }
            Box::new(MemoryBackend::new())
        }
    }
}

/// Reads a secret the active backend does not have out of the macOS Keychain, and files it in the
/// active backend so the next read finds it there.
///
/// The vault became the default backend in `19fd717b`, replacing the Keychain — with no migration.
/// An install that had connected an account *before* that change kept its token in the Keychain,
/// where nothing looks for it any more, while `settings.json` went on listing the account. The app
/// therefore showed a connected account whose every authenticated request failed with "No github
/// credential is stored", and, because the anonymous paths still worked, it failed *selectively*:
/// public previews rendered while detail panels and the Launchpad came back empty.
///
/// Adoption is best-effort and one-way. A Keychain read on a machine that never used that backend
/// simply returns `None`, and a failure to re-file an adopted secret is logged rather than raised —
/// the caller asked for the secret, and returning it is more useful than failing because the copy
/// could not be cached.
///
/// On an unsigned build this read can raise the macOS Keychain prompt the vault exists to avoid —
/// but only *once* per orphaned credential, and only for a user who has one, because the copy into
/// the vault is what the next launch reads. Weighed against the alternative it replaces (an account
/// that looks connected and silently fails every request until the user thinks to reconnect it), one
/// prompt is the cheaper outcome.
fn adopt_legacy_keychain_secret(key: &str) -> Option<String> {
    if active_backend_kind() != StorageBackendKind::Vault {
        return None;
    }

    let secret = match KeychainBackend::new().get(key) {
        Ok(found) => found?,
        // Never fatal: this runs on the read path of an account the active backend simply may not
        // have, and a machine with no such Keychain entry is the normal case, not an error.
        Err(e) => {
            eprintln!("[credentials] Could not check the macOS Keychain for '{key}': {e}");
            return None;
        }
    };

    eprintln!(
        "[credentials] Adopted '{key}' from the macOS Keychain into the encrypted vault \
         (stored there before the vault became the default backend)."
    );
    if let Err(e) = backend().set(key, &secret) {
        eprintln!("[credentials] Could not copy '{key}' into the encrypted vault: {e}");
    }
    Some(secret)
}

fn backend() -> &'static dyn SecretBackend {
    static BACKEND: OnceLock<Box<dyn SecretBackend>> = OnceLock::new();
    BACKEND.get_or_init(init_backend).as_ref()
}

/// Writes (or replaces) a secret. An empty secret deletes the entry instead.
pub fn set_secret(kind: CredentialKind, id: &str, secret: &str) -> Result<(), AppError> {
    if secret.is_empty() {
        return delete_secret(kind, id);
    }
    let name = entry_name(kind, id)?;
    backend().set(&name, secret)
}

/// Reads a secret back. **Rust-only** — there is no command in front of this, by design.
///
/// Falls back to [`adopt_legacy_keychain_secret`] when the active backend has nothing, so an account
/// connected before the vault became the default keeps working instead of silently losing its token.
pub fn get_secret(kind: CredentialKind, id: &str) -> Result<Option<String>, AppError> {
    let name = entry_name(kind, id)?;
    match backend().get(&name)? {
        Some(secret) => Ok(Some(secret)),
        None => Ok(adopt_legacy_keychain_secret(&name)),
    }
}

/// Removes a secret. Deleting one that is not there succeeds silently.
pub fn delete_secret(kind: CredentialKind, id: &str) -> Result<(), AppError> {
    let name = entry_name(kind, id)?;
    backend().delete(&name)
}

/// Whether a secret is stored.
///
/// Goes through [`get_secret`] rather than the backend directly so that a legacy Keychain entry
/// counts as stored — otherwise "is this account connected?" would answer no for an account whose
/// token is one adoption away, which is precisely the state this module now repairs.
pub fn has_secret(kind: CredentialKind, id: &str) -> Result<bool, AppError> {
    Ok(get_secret(kind, id)?.is_some())
}

/// Reads a secret, turning a missing one into a user-friendly error.
///
/// Logs the miss: this error surfaces to the user as a failed GitHub call, and without a line here
/// there is nothing anywhere — Rust or webview — saying *which* account had no credential.
pub fn require_secret(kind: CredentialKind, id: &str) -> Result<String, AppError> {
    get_secret(kind, id)?.ok_or_else(|| {
        eprintln!(
            "[credentials] No {} credential found for '{id}' in the {} backend.",
            kind.as_str(),
            active_backend_kind().as_str()
        );
        AppError::InvalidInput(format!(
            "No {} credential is stored for '{id}'. Reconnect the account in Settings.",
            kind.as_str()
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_a_prefixed_entry_name_per_kind() {
        assert_eq!(
            entry_name(CredentialKind::GitHub, "octocat").unwrap(),
            "github:octocat"
        );
        assert_eq!(
            entry_name(CredentialKind::Ai, AI_CREDENTIAL_ID).unwrap(),
            "ai:provider"
        );
    }

    #[test]
    fn trims_the_id_so_a_stray_space_is_not_a_second_account() {
        assert_eq!(
            entry_name(CredentialKind::GitLab, "  alice  ").unwrap(),
            "gitlab:alice"
        );
    }

    #[test]
    fn rejects_an_empty_or_colon_bearing_id() {
        assert!(entry_name(CredentialKind::GitHub, "   ").is_err());
        assert!(entry_name(CredentialKind::GitHub, "gitlab:alice").is_err());
    }

    #[test]
    fn parses_only_the_four_known_kinds() {
        assert_eq!(
            CredentialKind::parse("bitbucket").unwrap(),
            CredentialKind::Bitbucket
        );
        assert!(CredentialKind::parse("aws").is_err());
    }

    #[test]
    fn the_env_switch_is_off_unless_asked_for() {
        assert!(!memory_store_requested_by(None));
        for off in ["", "  ", "0", "false", "  0  "] {
            assert!(!memory_store_requested_by(Some(off)), "{off:?} means off");
        }
        for on in ["1", "true", "yes", " 1 "] {
            assert!(memory_store_requested_by(Some(on)), "{on:?} means on");
        }
    }
}
