use std::collections::HashMap;
use std::sync::Mutex;

use crate::services::terminal_pty::TerminalSession;

pub struct AppState {
    /// Open repos: path → validated path
    pub open_repos: Mutex<HashMap<String, String>>,
    /// Cancellation token for AI generation
    pub generation_cancel: Mutex<bool>,
    /// Live integrated-terminal PTY sessions, keyed by session id (see `commands/terminal.rs`).
    pub terminals: Mutex<HashMap<String, TerminalSession>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            open_repos: Mutex::new(HashMap::new()),
            generation_cancel: Mutex::new(false),
            terminals: Mutex::new(HashMap::new()),
        }
    }
}
