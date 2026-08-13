//! The local encrypted vault backend (`~/.git-manager/vault.enc`).
//!
//! Stores credentials securely at rest using AES-256-GCM authenticated encryption.
//! Eliminates OS keychain prompts on unsigned builds while guaranteeing confidentiality.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;

use super::backend::SecretBackend;
use super::crypto::{decrypt_payload, derive_vault_key, encrypt_payload};
use crate::error::AppError;

pub struct EncryptedVaultBackend {
    vault_path: PathBuf,
    key: [u8; 32],
    lock: Mutex<()>,
}

impl EncryptedVaultBackend {
    pub fn new(base_dir: PathBuf) -> Result<Self, AppError> {
        let key = derive_vault_key(&base_dir)?;
        let vault_path = base_dir.join("vault.enc");
        Ok(Self {
            vault_path,
            key,
            lock: Mutex::new(()),
        })
    }

    fn load_entries(&self) -> Result<HashMap<String, String>, AppError> {
        if !self.vault_path.exists() {
            return Ok(HashMap::new());
        }

        let raw = fs::read(&self.vault_path).map_err(|e| {
            AppError::Unknown(format!("Could not read vault file {}: {e}", self.vault_path.display()))
        })?;

        if raw.is_empty() {
            return Ok(HashMap::new());
        }

        let decrypted = decrypt_payload(&raw, &self.key)?;
        serde_json::from_slice(&decrypted).map_err(|e| {
            AppError::Unknown(format!("Invalid JSON inside decrypted vault: {e}"))
        })
    }

    fn save_entries(&self, entries: &HashMap<String, String>) -> Result<(), AppError> {
        if let Some(parent) = self.vault_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                AppError::Unknown(format!("Could not create vault directory {}: {e}", parent.display()))
            })?;
        }

        let json_bytes = serde_json::to_vec(entries).map_err(|e| {
            AppError::Unknown(format!("Could not serialize vault entries: {e}"))
        })?;

        let encrypted = encrypt_payload(&json_bytes, &self.key)?;

        // Atomic write: write to temp file then rename
        let tmp_path = self.vault_path.with_extension("enc.tmp");

        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);

        #[cfg(unix)]
        options.mode(0o600); // Strict user-only permissions

        let mut file = options.open(&tmp_path).map_err(|e| {
            AppError::Unknown(format!("Could not open temp vault file {}: {e}", tmp_path.display()))
        })?;

        file.write_all(&encrypted).map_err(|e| {
            AppError::Unknown(format!("Could not write temp vault file: {e}"))
        })?;

        file.flush().map_err(|e| {
            AppError::Unknown(format!("Could not flush temp vault file: {e}"))
        })?;

        drop(file);

        fs::rename(&tmp_path, &self.vault_path).map_err(|e| {
            AppError::Unknown(format!("Could not commit vault file to {}: {e}", self.vault_path.display()))
        })?;

        Ok(())
    }
}

impl SecretBackend for EncryptedVaultBackend {
    fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let entries = self.load_entries()?;
        Ok(entries.get(key).cloned())
    }

    fn set(&self, key: &str, secret: &str) -> Result<(), AppError> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut entries = self.load_entries()?;
        entries.insert(key.to_string(), secret.to_string());
        self.save_entries(&entries)
    }

    fn delete(&self, key: &str) -> Result<(), AppError> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut entries = self.load_entries()?;
        if entries.remove(key).is_some() {
            self.save_entries(&entries)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vault_round_trips_secrets_and_persists() {
        let temp_dir = std::env::temp_dir().join(format!("gm_vault_test_{}", std::process::id()));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let backend = EncryptedVaultBackend::new(temp_dir.clone()).unwrap();

        assert_eq!(backend.get("github:test").unwrap(), None);

        backend.set("github:test", "secret_token_123").unwrap();
        assert_eq!(backend.get("github:test").unwrap(), Some("secret_token_123".to_string()));

        // Check that a fresh backend instance with same key reads the persisted vault
        let backend_reloaded = EncryptedVaultBackend::new(temp_dir.clone()).unwrap();
        assert_eq!(backend_reloaded.get("github:test").unwrap(), Some("secret_token_123".to_string()));

        backend_reloaded.delete("github:test").unwrap();
        assert_eq!(backend_reloaded.get("github:test").unwrap(), None);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
