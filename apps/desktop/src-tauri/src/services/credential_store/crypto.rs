//! Cryptographic operations for the local encrypted vault.
//!
//! Uses AES-256-GCM (Authenticated Encryption with Associated Data - AEAD)
//! with a hardware/machine-scoped seed to ensure credentials remain securely encrypted
//! at rest in `~/.git-manager/vault.enc` without requiring interactive macOS password prompts.

use aes_gcm::aead::{Aead, Generate, KeyInit, Nonce};
use aes_gcm::{Aes256Gcm, Key};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;

use crate::error::AppError;

const SEED_FILE: &str = ".vault_seed";
const NONCE_LEN: usize = 12;

/// Derives a stable 256-bit encryption key bound to the user profile and machine.
pub fn derive_vault_key(base_dir: &Path) -> Result<[u8; 32], AppError> {
    let seed_path = base_dir.join(SEED_FILE);

    let seed_bytes = if seed_path.exists() {
        fs::read(&seed_path).map_err(|e| {
            AppError::Unknown(format!(
                "Could not read vault seed file {}: {e}",
                seed_path.display()
            ))
        })?
    } else {
        fs::create_dir_all(base_dir).map_err(|e| {
            AppError::Unknown(format!(
                "Could not create vault directory {}: {e}",
                base_dir.display()
            ))
        })?;

        let random_seed: [u8; 32] = Generate::generate();

        let mut options = OpenOptions::new();
        options.write(true).create_new(true);

        #[cfg(unix)]
        options.mode(0o600); // Only accessible by current user

        let mut file = options.open(&seed_path).map_err(|e| {
            AppError::Unknown(format!(
                "Could not create vault seed file {}: {e}",
                seed_path.display()
            ))
        })?;

        file.write_all(&random_seed)
            .map_err(|e| AppError::Unknown(format!("Could not write vault seed: {e}")))?;

        random_seed.to_vec()
    };

    let mut hasher = Sha256::new();
    hasher.update(b"git-manager-vault-v1");
    hasher.update(&seed_bytes);

    if let Ok(user) = std::env::var("USER") {
        hasher.update(user.as_bytes());
    }

    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    Ok(key)
}

/// Encrypts plaintext bytes using AES-256-GCM with a freshly generated random nonce.
/// Format: `[12-byte nonce || ciphertext + 16-byte auth tag]`
pub fn encrypt_payload(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, AppError> {
    let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(*key));
    let nonce = Nonce::<Aes256Gcm>::generate();

    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|e| AppError::Unknown(format!("Encryption error: {e}")))?;

    let mut output = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    output.extend_from_slice(&nonce);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

/// Decrypts AES-256-GCM payload and verifies authentication tag.
pub fn decrypt_payload(data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, AppError> {
    if data.len() < NONCE_LEN {
        return Err(AppError::Unknown(
            "Encrypted vault data is corrupt or too short".to_string(),
        ));
    }

    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = <&Nonce<Aes256Gcm>>::try_from(nonce_bytes)
        .map_err(|_| AppError::Unknown("Encrypted vault data has an invalid nonce".to_string()))?;
    let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(*key));

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::Unknown(format!("Decryption or authentication failed: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypts_and_decrypts_successfully() {
        let key = [42u8; 32];
        let message = b"my-super-secret-github-token";

        let encrypted = encrypt_payload(message, &key).expect("encryption should succeed");
        assert_ne!(&encrypted[..], message);
        assert!(encrypted.len() > message.len());

        let decrypted = decrypt_payload(&encrypted, &key).expect("decryption should succeed");
        assert_eq!(&decrypted[..], message);
    }

    #[test]
    fn refuses_tampered_ciphertext() {
        let key = [7u8; 32];
        let message = b"hello world";
        let mut encrypted = encrypt_payload(message, &key).unwrap();

        // Mutate one byte in ciphertext
        let last_idx = encrypted.len() - 1;
        encrypted[last_idx] ^= 0xFF;

        assert!(decrypt_payload(&encrypted, &key).is_err());
    }

    #[test]
    fn refuses_wrong_key() {
        let key1 = [1u8; 32];
        let key2 = [2u8; 32];
        let message = b"confidential payload";

        let encrypted = encrypt_payload(message, &key1).unwrap();
        assert!(decrypt_payload(&encrypted, &key2).is_err());
    }
}
