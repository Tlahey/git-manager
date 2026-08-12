//! The OS keychain, and the only place this app keeps a secret.
//!
//! Everything the user authenticates with — a GitHub/GitLab/Bitbucket token, an AI provider's API
//! key — lives here rather than in `~/.git-manager/settings.json`. The configuration file keeps the
//! *public* half of an account (its id, its login, its avatar) so the UI can list who is connected
//! without asking the keychain anything.
//!
//! # Why a service and not the `keyring` Tauri plugin
//!
//! The plugin would give JavaScript a `get`. That is precisely the capability being removed: the
//! frontend is not meant to be trusted with a token, it is meant to be *unable* to obtain one. So
//! the read lives in Rust and has no command in front of it — `commands/credentials.rs` exposes
//! store/delete/has and nothing else, and every use of a secret (the GitHub proxy, the AI provider)
//! reads it here, on the Rust side of the IPC boundary, and sends it straight to the network.
//!
//! # Why not an encrypted file
//!
//! An encrypted vault needs an unlock key, so either the user types a password at every launch or
//! the key sits on disk next to the thing it protects — the problem moves one level up rather than
//! away. Tauri's own Stronghold plugin, the usual answer, is no longer recommended by its
//! maintainers and is slated for removal in v3. The keychain is what the platform already provides.
//!
//! # Development note
//!
//! macOS scopes a keychain item's ACL to the binary that created it, so a fresh `pnpm dev` build
//! meets a prompt ("git-manager wants to use your confidential information") the first time it reads
//! a token it wrote before the rebuild. Clicking "Always Allow" only helps until the next rebuild —
//! this is inherent to running an unsigned binary, and it does not happen for a signed release.

use crate::error::AppError;
use keyring::Entry;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

// `keyring` is compiled with `default-features = false, features = ["apple-native"]`, because this
// app is macOS-only and the Linux backend would drag in the D-Bus/OpenSSL stack for nothing.
//
// The catch, and the reason this guard exists: when no backend matches the target, `keyring` does
// not fail to build — it falls back to its **in-memory mock store** (`lib.rs`: `#[cfg(all(target_os
// = "windows", not(feature = "windows-native")))] pub use mock as default;`). A Windows or Linux
// build would therefore compile, launch, look like it worked, keep every token in process memory
// with no protection from the OS, and lose the lot on quit. Silently. Porting this app is exactly
// the plausible change that would trip it, so it fails here at compile time instead.
//
// To port: add the target's feature (`windows-native`, or `sync-secret-service`/`linux-native` on
// Linux) and widen this guard. On Linux, note that Secret Service needs a running
// `gnome-keyring`/KWallet daemon — a headless box or a bare window manager has none, so that port
// owes the user an answer for what happens when the platform has no keychain at all.
#[cfg(not(target_os = "macos"))]
compile_error!(
    "credential_store requires a real OS keychain: enable the keyring backend for this target \
     before building, or secrets would silently fall back to an in-memory mock store."
);

/// The keychain service name every entry is filed under — one "Git Manager" group in Keychain
/// Access, rather than a scatter of unrelated-looking items the user cannot recognise or revoke.
const SERVICE: &str = "git-manager";

/// Which kind of secret an entry holds. A closed set on purpose: `commands/credentials.rs` parses a
/// caller's string through {@link CredentialKind::parse}, so the frontend can write GitHub, GitLab,
/// Bitbucket and AI credentials and nothing else — it cannot turn the keychain into scratch storage.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CredentialKind {
    GitHub,
    GitLab,
    Bitbucket,
    /// The configured AI provider's API key. Unlike the three above there is one of it, so its
    /// entry id is fixed (see {@link AI_CREDENTIAL_ID}).
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

/// The single entry id every AI key is stored under — there is one configured provider at a time.
pub const AI_CREDENTIAL_ID: &str = "provider";

/// The keychain entry name for one credential, e.g. `github:octocat`.
///
/// Kept as one flat string rather than nesting because a keychain generic password has exactly two
/// coordinates (service, account), and splitting the kind out into the service name would give the
/// user four unrelated-looking groups to reason about instead of one.
fn entry_name(kind: CredentialKind, id: &str) -> Result<String, AppError> {
    let id = id.trim();
    if id.is_empty() {
        return Err(AppError::InvalidInput(
            "A credential id cannot be empty".to_string(),
        ));
    }
    // A colon would make `github:a:b` and `github:a` ambiguous and, worse, would let one account id
    // address another kind's entry. Ids are logins and uuids, so rejecting it costs nothing.
    if id.contains(':') {
        return Err(AppError::InvalidInput(
            "A credential id cannot contain ':'".to_string(),
        ));
    }
    Ok(format!("{}:{}", kind.as_str(), id))
}

fn entry(kind: CredentialKind, id: &str) -> Result<Entry, AppError> {
    let name = entry_name(kind, id)?;
    Entry::new(SERVICE, &name).map_err(|e| AppError::Unknown(format!("Keychain unavailable: {e}")))
}

// ─── The test double ─────────────────────────────────────────────────────────

/// Switches the OS keychain off for this process, in favour of an in-memory store that dies with it.
///
/// Exists for the **e2e suite**, and it is not a nicety: that suite launches the real binary, so
/// without this a scenario that connects an account would write into the *developer's own login
/// keychain* — and the migration would do it merely by finding a seeded token in `localStorage`. A
/// test run must not be able to touch, overwrite or leave anything in the credentials a person
/// actually uses. `apps/e2e/support/isolatedAppState.ts` sets it beside `GIT_MANAGER_NO_CONFIG`,
/// which switches off the configuration file for the same reason.
///
/// Deliberately *not* gated on the `e2e` cargo feature. The suite runs a copy of the ordinary
/// binary, and a guard that only exists in a specially compiled build would not protect the run that
/// actually happens.
const DISABLE_ENV: &str = "GIT_MANAGER_NO_KEYCHAIN";

fn use_memory_store() -> bool {
    memory_store_requested_by(std::env::var(DISABLE_ENV).ok().as_deref())
}

/// Split out from [`use_memory_store`] so it is testable, for the reason `app_config::disabled_by`
/// gives: `set_var` in a test binary mutates process state every other test shares, which is exactly
/// the cross-test coupling this crate's suites go out of their way to avoid.
///
/// Any non-empty value counts, `0` and `false` excepted — a variable set to `0` reads as "off" to
/// everyone who has ever exported one, and honouring that is cheaper than the bug report.
fn memory_store_requested_by(value: Option<&str>) -> bool {
    match value.map(str::trim) {
        None | Some("") | Some("0") | Some("false") => false,
        Some(_) => true,
    }
}

/// The in-memory stand-in. Process-local and never persisted, so a run leaves nothing behind.
fn memory_store() -> &'static Mutex<HashMap<String, String>> {
    static STORE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn memory_lock() -> std::sync::MutexGuard<'static, HashMap<String, String>> {
    // A poisoned lock means a previous holder panicked; the map is still structurally sound and
    // losing every credential over it would be worse than carrying on.
    memory_store().lock().unwrap_or_else(|e| e.into_inner())
}

// ─── The store itself ────────────────────────────────────────────────────────

/// Writes (or replaces) a secret. An empty secret deletes the entry instead: "no key configured" is
/// how the AI settings form spells clearing the field, and an empty string in the keychain would
/// otherwise read back as a configured-but-blank credential.
pub fn set_secret(kind: CredentialKind, id: &str, secret: &str) -> Result<(), AppError> {
    if secret.is_empty() {
        return delete_secret(kind, id);
    }
    let name = entry_name(kind, id)?;
    if use_memory_store() {
        memory_lock().insert(name, secret.to_string());
        return Ok(());
    }
    entry(kind, id)?
        .set_password(secret)
        .map_err(|e| AppError::Unknown(format!("Could not save to the keychain: {e}")))
}

/// Reads a secret back. **Rust-only** — there is no command in front of this, by design.
///
/// A missing entry is `Ok(None)` rather than an error: an account whose keychain item was revoked or
/// never migrated is a state the callers handle (they report "reconnect this account"), not a
/// transport failure.
pub fn get_secret(kind: CredentialKind, id: &str) -> Result<Option<String>, AppError> {
    let name = entry_name(kind, id)?;
    if use_memory_store() {
        return Ok(memory_lock().get(&name).cloned());
    }
    match entry(kind, id)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Unknown(format!(
            "Could not read from the keychain: {e}"
        ))),
    }
}

/// Removes a secret. Deleting one that is not there succeeds — disconnecting an account must not
/// fail because its token was already gone.
pub fn delete_secret(kind: CredentialKind, id: &str) -> Result<(), AppError> {
    let name = entry_name(kind, id)?;
    if use_memory_store() {
        memory_lock().remove(&name);
        return Ok(());
    }
    match entry(kind, id)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Unknown(format!(
            "Could not remove from the keychain: {e}"
        ))),
    }
}

/// Whether a secret is stored — the "is this account still usable?" check, which the frontend is
/// allowed to ask because the answer is a boolean rather than a credential.
pub fn has_secret(kind: CredentialKind, id: &str) -> Result<bool, AppError> {
    Ok(get_secret(kind, id)?.is_some())
}

/// Reads a secret, turning a missing one into the error the caller would have written anyway.
///
/// Every network path needs the same sentence — an account listed in the settings whose token is not
/// in the keychain is a half-migrated or partly-revoked install, and the only useful answer is
/// "connect it again" rather than GitHub's own 401.
pub fn require_secret(kind: CredentialKind, id: &str) -> Result<String, AppError> {
    get_secret(kind, id)?.ok_or_else(|| {
        AppError::InvalidInput(format!(
            "No {} credential is stored for '{id}'. Reconnect the account in Settings.",
            kind.as_str()
        ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // The real keychain is never exercised here: writing to it would write to the *developer's own*
    // login keychain (and prompt for access on an unsigned build), which is not something a test run
    // is allowed to do. So these cover the pure key/validation logic, plus the in-memory double —
    // which is the one path a test may safely drive end to end, and the one the e2e suite depends on.

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
        // Would otherwise let a GitHub id address a GitLab entry.
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

    // ─── The in-memory double ────────────────────────────────────────────────
    //
    // `use_memory_store` reads the environment, and `set_var` in a test binary mutates process state
    // every other test shares. So the switch is tested through its pure half, and the store itself is
    // driven directly — which is what the e2e suite's isolation actually rests on.

    #[test]
    fn the_env_switch_is_off_unless_asked_for() {
        // Unset is the shipping case, and it must mean "use the real keychain".
        assert!(!memory_store_requested_by(None));
        for off in ["", "  ", "0", "false", "  0  "] {
            assert!(!memory_store_requested_by(Some(off)), "{off:?} means off");
        }
        for on in ["1", "true", "yes", " 1 "] {
            assert!(memory_store_requested_by(Some(on)), "{on:?} means on");
        }
    }

    #[test]
    fn the_memory_store_round_trips_and_forgets() {
        let name = entry_name(CredentialKind::GitHub, "memtest").unwrap();
        memory_lock().insert(name.clone(), "s3cret".to_string());
        assert_eq!(memory_lock().get(&name).map(String::as_str), Some("s3cret"));

        memory_lock().remove(&name);
        assert_eq!(memory_lock().get(&name), None);
    }

    /// Nothing about the double may reach the real keychain — that is its entire purpose.
    #[test]
    fn the_memory_store_is_keyed_the_same_way_as_the_real_one() {
        // Same key builder, so a test that seeds the double addresses exactly the entry the app
        // would have written, and a scenario cannot pass against a differently-shaped stand-in.
        assert_eq!(
            entry_name(CredentialKind::Ai, AI_CREDENTIAL_ID).unwrap(),
            "ai:provider"
        );
        assert!(entry_name(CredentialKind::GitHub, "").is_err());
    }
}
