//! The macOS Keychain backend using native Security.framework via `keyring`.

use super::backend::SecretBackend;
use crate::error::AppError;
use keyring::Entry;

const SERVICE: &str = "git-manager";

pub struct KeychainBackend;

impl KeychainBackend {
    pub fn new() -> Self {
        Self
    }

    fn entry(&self, key: &str) -> Result<Entry, AppError> {
        Entry::new(SERVICE, key)
            .map_err(|e| AppError::Unknown(format!("Keychain unavailable: {e}")))
    }
}

impl SecretBackend for KeychainBackend {
    fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        match self.entry(key)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Unknown(format!(
                "Could not read from the keychain: {e}"
            ))),
        }
    }

    fn set(&self, key: &str, secret: &str) -> Result<(), AppError> {
        self.entry(key)?
            .set_password(secret)
            .map_err(|e| AppError::Unknown(format!("Could not save to the keychain: {e}")))
    }

    fn delete(&self, key: &str) -> Result<(), AppError> {
        match self.entry(key)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Unknown(format!(
                "Could not remove from the keychain: {e}"
            ))),
        }
    }
}
