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

    /// Checks whether a secret exists for a key.
    fn has(&self, key: &str) -> Result<bool, AppError> {
        Ok(self.get(key)?.is_some())
    }
}
