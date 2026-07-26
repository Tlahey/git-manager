use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::services::terminal_pty::TerminalSession;

/// In-flight streaming generations, keyed by the request id the frontend minted for each one.
///
/// This replaces a single `Mutex<bool>` shared by every generation, which was a bug the moment two
/// could overlap — and they can: the commit-message box, an explanation panel and a code review are
/// all reachable at once, and nothing in the UI serialises them. Cancelling any one of them flipped
/// the one flag, so the *other* generation stopped mid-sentence with no error and no explanation.
///
/// Keyed rather than counted because cancellation has to name its target. An `AtomicBool` per entry
/// rather than a `bool` behind the registry's own lock, so a provider polling it between SSE chunks
/// never contends with — or gets poisoned by — an unrelated `cancel_generation` call.
#[derive(Default)]
pub struct GenerationRegistry {
    inner: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl GenerationRegistry {
    /// Registers a generation and hands back its cancel flag.
    ///
    /// Re-registering an id replaces the old entry, which is what makes a re-run of the same feature
    /// safe: the previous flag is dropped, so a late `cancel` for a finished run cannot reach in and
    /// stop the new one.
    pub fn register(&self, request_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.inner
            .lock()
            .unwrap()
            .insert(request_id.to_string(), Arc::clone(&flag));
        flag
    }

    /// Flags one generation as cancelled. Unknown ids are ignored: a cancel that arrives after the
    /// stream finished is normal (the user hit stop as the last token landed), not an error.
    pub fn cancel(&self, request_id: &str) {
        if let Some(flag) = self.inner.lock().unwrap().get(request_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    /// Drops a finished generation's entry, so the map does not grow for the life of the process.
    pub fn finish(&self, request_id: &str) {
        self.inner.lock().unwrap().remove(request_id);
    }

    /// How many generations are currently registered. Test-facing.
    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.inner.lock().unwrap().len()
    }
}

pub struct AppState {
    /// Open repos: path → validated path
    pub open_repos: Mutex<HashMap<String, String>>,
    /// Cancellation flags for the AI generations currently streaming, one per request id.
    pub generations: GenerationRegistry,
    /// Live integrated-terminal PTY sessions, keyed by session id (see `commands/terminal.rs`).
    pub terminals: Mutex<HashMap<String, TerminalSession>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            open_repos: Mutex::new(HashMap::new()),
            generations: GenerationRegistry::default(),
            terminals: Mutex::new(HashMap::new()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelling_one_generation_leaves_the_other_running() {
        // The whole point of the registry: this is the bug the single shared flag had.
        let registry = GenerationRegistry::default();
        let first = registry.register("req-1");
        let second = registry.register("req-2");

        registry.cancel("req-1");

        assert!(first.load(Ordering::SeqCst));
        assert!(!second.load(Ordering::SeqCst));
    }

    #[test]
    fn cancelling_an_unknown_id_is_a_no_op() {
        // Hitting stop as the last token lands is normal, not an error.
        let registry = GenerationRegistry::default();
        let flag = registry.register("req-1");

        registry.cancel("req-does-not-exist");

        assert!(!flag.load(Ordering::SeqCst));
    }

    #[test]
    fn a_late_cancel_cannot_stop_a_rerun_of_the_same_feature() {
        // Re-registering replaces the entry, so the stale flag the previous run still holds is no
        // longer reachable from the registry.
        let registry = GenerationRegistry::default();
        let first = registry.register("req-1");
        let second = registry.register("req-1");

        registry.cancel("req-1");

        assert!(!first.load(Ordering::SeqCst));
        assert!(second.load(Ordering::SeqCst));
    }

    #[test]
    fn finishing_a_generation_frees_its_entry() {
        let registry = GenerationRegistry::default();
        registry.register("req-1");
        registry.register("req-2");
        assert_eq!(registry.len(), 2);

        registry.finish("req-1");
        assert_eq!(registry.len(), 1);

        // Finishing twice is safe — the command's cleanup runs on every exit path.
        registry.finish("req-1");
        assert_eq!(registry.len(), 1);
    }
}
