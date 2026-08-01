//! Telling the frontend that a repository hook is running, while it runs.
//!
//! A hook is the one part of a commit or a push whose duration belongs to the user rather than to
//! this app: `lint-staged` over a large change, a test suite gating a push. Until now there was
//! nothing between "the user pressed Commit" and "the commit landed, or a hook refused it" —
//! which, for the hooks worth having, is a frozen-looking app for as long as they take.
//!
//! Lives here rather than in `services/git_hooks` because emitting needs an `AppHandle`, and the
//! service layer is deliberately `git2`-only; and rather than in either command file because both
//! `commit` and `remote` run hooks and would otherwise import one from the other.

use crate::services::git_hooks::{self, HookEvent, ObserverGuard};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const HOOK_PROGRESS_EVENT: &str = "hook-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HookProgressEvent {
    /// The repository the hook belongs to — several operations can be in flight at once.
    repo_path: String,
    #[serde(flatten)]
    event: HookEvent,
}

/// Reports every hook run on **this thread** to the frontend, until the returned guard drops.
///
/// Must be called from inside the `spawn_blocking` closure that does the work, not around it: the
/// observer is thread-scoped (see `git_hooks::report_to`), and the thread that matters is the one
/// the hook is actually waited on.
///
/// A failed emit is ignored, the same way transfer progress ignores it: this is decoration, and a
/// commit must not fail because the window it was reporting to went away.
#[must_use = "hooks are only reported while this guard is alive"]
pub fn report_hooks(app: AppHandle, repo_path: String) -> ObserverGuard {
    git_hooks::report_to(move |event| {
        let _ = app.emit(
            HOOK_PROGRESS_EVENT,
            HookProgressEvent {
                repo_path: repo_path.clone(),
                event,
            },
        );
    })
}
