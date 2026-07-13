use std::collections::HashMap;
use std::sync::Mutex;

pub struct AppState {
    /// Open repos: path → validated path
    pub open_repos: Mutex<HashMap<String, String>>,
    /// Cancellation token for AI generation
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
