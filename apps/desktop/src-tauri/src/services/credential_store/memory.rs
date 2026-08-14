//! In-memory stand-in backend for tests, E2E scenarios, and zero-persistence environments.

use super::backend::SecretBackend;
use crate::error::AppError;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

pub struct MemoryBackend {
    store: Mutex<HashMap<String, String>>,
}

impl MemoryBackend {
    pub fn new() -> Self {
        Self {
            store: Mutex::new(HashMap::new()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, String>> {
        self.store.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl SecretBackend for MemoryBackend {
    fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        Ok(self.lock().get(key).cloned())
    }

    fn set(&self, key: &str, secret: &str) -> Result<(), AppError> {
        self.lock().insert(key.to_string(), secret.to_string());
        Ok(())
    }

    fn delete(&self, key: &str) -> Result<(), AppError> {
        self.lock().remove(key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_backend_round_trips_and_deletes() {
        let backend = MemoryBackend::new();
        assert_eq!(backend.get("test:key").unwrap(), None);

        backend.set("test:key", "value123").unwrap();
        assert_eq!(
            backend.get("test:key").unwrap(),
            Some("value123".to_string())
        );

        backend.delete("test:key").unwrap();
        assert_eq!(backend.get("test:key").unwrap(), None);
    }
}
