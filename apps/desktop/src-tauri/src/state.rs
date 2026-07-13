use std::collections::HashMap;
use std::sync::Mutex;

pub struct AppState {
    /// Repos ouverts : path → chemin validé
    pub open_repos: Mutex<HashMap<String, String>>,
    /// Token d'annulation pour la génération AI
    pub generation_cancel: Mutex<bool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            open_repos: Mutex::new(HashMap::new()),
            generation_cancel: Mutex::new(false),
        }
    }
}
