use std::collections::HashMap;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaConfig {
    pub url: String,
    pub model: String,
    pub temperature: f32,
    pub timeout_seconds: u64,
}

impl Default for OllamaConfig {
    fn default() -> Self {
        Self {
            url: "http://localhost:11434".to_string(),
            model: "llama3.2".to_string(),
            temperature: 0.3,
            timeout_seconds: 30,
        }
    }
}

pub struct AppState {
    /// Repos ouverts : path → chemin validé
    pub open_repos: Mutex<HashMap<String, String>>,
    /// Configuration Ollama courante
    pub ollama_config: Mutex<OllamaConfig>,
    /// Token d'annulation pour la génération Ollama
    pub generation_cancel: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            open_repos: Mutex::new(HashMap::new()),
            ollama_config: Mutex::new(OllamaConfig::default()),
            generation_cancel: Mutex::new(false),
        }
    }
}
