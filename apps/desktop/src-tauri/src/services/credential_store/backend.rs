use crate::error::AppError;

/// SOLID Contract: Minimal secret storage interface.
///
/// Implementations (Encrypted Vault, Keychain, In-Memory) can be substituted
/// transparently without affecting any higher-level service (Liskov Substitution & Interface Segregation).
pub trait SecretBackend: Send + Sync {
    /// Reads a secret by its full entry key. Returns `Ok(None)` if not found.
    fn get(&self, key: &str) -> Result<Option<String>, AppError>;

    /// Stores (or replaces) a secret for a given entry key.
    fn set(&self, key: &str, secret: &str) -> Result<(), AppError>;

    /// Removes a secret by key. Succeeds silently if the entry did not exist.
    fn delete(&self, key: &str) -> Result<(), AppError>;

    // No `has` here on purpose. It existed as a convenience wrapper over `get`, and
    // `credential_store::has_secret` was its only caller — but that function must now answer
    // through `get_secret`, so that a token still sitting in the macOS Keychain (from before the
    // vault became the default backend) counts as stored rather than reading as "not connected".
    // A backend-level existence check would bypass exactly that repair.
}
