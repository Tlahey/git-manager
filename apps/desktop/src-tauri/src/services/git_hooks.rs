//! Running a repository's git hooks.
//!
//! ## Why this exists
//!
//! Everything this app does to a repository goes through `git2` (libgit2), and **libgit2 does not
//! run hooks** — it has no hook support at all, by design, leaving it to the caller. Nothing here
//! ever called it. So a repository with a `pre-commit` hook (husky, lint-staged, a formatter, a
//! test gate) had that hook silently skipped for every commit made from this app, while the same
//! commit from a terminal ran it. The user's own quality gate, quietly off, with no message
//! anywhere saying so.
//!
//! ## The PATH problem, which decides whether any of this works
//!
//! A macOS app launched from Finder inherits a minimal environment: `PATH` is roughly
//! `/usr/bin:/bin:/usr/sbin:/sbin`, with none of the user's shell configuration. Almost every
//! real-world hook is a shell script that calls `npx`, `node`, `pnpm` or a tool from a version
//! manager — all of which live on the `PATH` a login shell builds and none of which are on that
//! minimal one. Running hooks with the app's own environment would therefore fail with
//! `command not found` for nearly everybody who has a hook at all, which is worse than not running
//! them: a green terminal and a red app, for the same commit.
//!
//! So the hook is executed directly, the way git does it, but with `PATH` replaced by the one the
//! user's login shell reports. That is resolved once per process and cached — it costs a shell
//! startup, and hooks are not the only thing that would want it if more of the app ever shells out.

use crate::error::AppError;
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;

/// A hook starting, or finishing.
///
/// Only ever reported for a hook that actually exists — a repository with no `pre-commit` has
/// nothing to say about one, and a card announcing a hook that was never going to run is worse
/// than silence.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "phase")]
pub enum HookEvent {
    Started { name: String },
    Finished { name: String, success: bool },
}

thread_local! {
    /// Who to tell about hooks running on *this* thread.
    ///
    /// A thread-local rather than a parameter threaded through `create_commit`, `push` and the two
    /// private helpers between them: every one of those signatures — and the twenty-odd call sites
    /// in their tests — would have to carry a callback that nothing but the progress card wants,
    /// and `git_hooks` is the only place that knows when a hook actually starts.
    ///
    /// Scoped to a thread rather than global because that is exactly the lifetime a parameter
    /// would have had. Every command that runs hooks does so inside one `spawn_blocking` closure,
    /// and the hook is a child process waited on from that same thread, so "this thread, right
    /// now" and "this operation" are the same span. Two concurrent commits on two blocking threads
    /// cannot see each other's observer, and {@link ObserverGuard} clears it on the way out, so a
    /// pooled thread never carries one into whatever it is reused for.
    static OBSERVER: RefCell<Option<Box<dyn Fn(HookEvent)>>> = const { RefCell::new(None) };
}

/// Clears the thread's observer when it goes out of scope.
///
/// Returned rather than left to the caller to unset: a command that returns early on an error —
/// which a refused hook always does — would otherwise leave its observer installed on a pooled
/// thread.
#[must_use = "the observer is uninstalled when this guard drops, so dropping it immediately makes the call pointless"]
pub struct ObserverGuard;

impl Drop for ObserverGuard {
    fn drop(&mut self) {
        OBSERVER.with(|observer| observer.borrow_mut().take());
    }
}

/// Reports every hook run on this thread to `report`, until the returned guard drops.
pub fn report_to(report: impl Fn(HookEvent) + 'static) -> ObserverGuard {
    OBSERVER.with(|observer| *observer.borrow_mut() = Some(Box::new(report)));
    ObserverGuard
}

fn notify(event: HookEvent) {
    // A shared borrow is held across the call, which is safe for the one thing that could go wrong
    // here: a `report` that somehow ran a hook itself would re-enter and take a second *shared*
    // borrow, which `RefCell` allows. Only `report_to` takes a mutable one, and it cannot run
    // while this thread is inside a hook.
    OBSERVER.with(|observer| {
        if let Some(report) = observer.borrow().as_ref() {
            report(event);
        }
    });
}

/// What a hook did.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookOutcome {
    pub name: String,
    /// `false` when the repository has no such hook — not a failure, just nothing to run.
    pub ran: bool,
    pub success: bool,
    /// `None` when the process was killed by a signal rather than exiting.
    pub exit_code: Option<i32>,
    /// stdout and stderr interleaved as the hook produced them, blank lines dropped.
    pub output: Vec<String>,
}

impl HookOutcome {
    /// The outcome for a hook the repository does not define.
    pub fn absent(name: &str) -> Self {
        Self {
            name: name.to_string(),
            ran: false,
            success: true,
            exit_code: None,
            output: Vec::new(),
        }
    }
}

/// The `PATH` a login shell reports, or `None` when it cannot be determined.
///
/// Cached for the process: resolving it starts a shell, which is far too expensive to repeat per
/// hook, and it cannot meaningfully change while the app runs.
fn login_path() -> Option<&'static str> {
    static PATH: OnceLock<Option<String>> = OnceLock::new();
    PATH.get_or_init(resolve_login_path).as_deref()
}

/// Asks the user's login shell what its `PATH` is.
///
/// `-l -c` rather than `-i`: a login shell is what sources the profile files where a `PATH` is
/// built (`.zprofile`, `.bash_profile`, and whatever a version manager installed), while an
/// *interactive* shell additionally sources rc files that may print banners and expect a tty.
#[cfg(unix)]
fn resolve_login_path() -> Option<String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let output = Command::new(shell)
        .args(["-l", "-c", "printf %s \"$PATH\""])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_login_path(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(unix))]
fn resolve_login_path() -> Option<String> {
    None
}

/// Picks the `PATH` out of a login shell's output.
///
/// The last non-empty line, not the whole output: a profile that prints something ("Welcome
/// back!", a version manager's notice) puts it on stdout ahead of the value, and taking the lot
/// would produce a `PATH` with a greeting in it.
pub fn parse_login_path(raw: &str) -> Option<String> {
    let line = raw
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .next_back()?;
    if !line.contains('/') {
        return None;
    }
    Some(line.to_string())
}

/// Where this repository keeps its hooks: `core.hooksPath` when set, else `<git-dir>/hooks`.
///
/// `core.hooksPath` is how husky v9 and every "hooks in the working tree" setup works, so a
/// resolver that only looked in `.git/hooks` would find nothing in most modern projects.
pub fn hooks_dir(repo: &Repository) -> PathBuf {
    let configured = repo
        .config()
        .ok()
        .and_then(|config| config.get_string("core.hooksPath").ok())
        .filter(|value| !value.trim().is_empty());

    match configured {
        // A relative `core.hooksPath` is resolved against the working tree, which is what makes
        // `.husky` work; an absolute one is taken as-is.
        Some(value) => resolve_hooks_path(&value, repo.workdir(), repo.path()),
        None => repo.path().join("hooks"),
    }
}

/// Kept separate from `hooks_dir` so the path arithmetic can be tested without a repository.
pub fn resolve_hooks_path(configured: &str, workdir: Option<&Path>, git_dir: &Path) -> PathBuf {
    let path = Path::new(configured);
    if path.is_absolute() {
        return path.to_path_buf();
    }
    // A bare repository has no working tree; the git dir is the only sensible base left.
    workdir.unwrap_or(git_dir).join(path)
}

/// Whether a file is a hook this platform will actually execute.
///
/// Git requires the executable bit, and so does this: a `pre-commit.sample` left non-executable
/// (which is how git ships them) must not be mistaken for a real hook.
#[cfg(unix)]
pub fn is_executable(metadata: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.is_file() && metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
pub fn is_executable(metadata: &std::fs::Metadata) -> bool {
    metadata.is_file()
}

/// The hook's path, or `None` when the repository does not define it.
pub fn find_hook(repo: &Repository, name: &str) -> Option<PathBuf> {
    let path = hooks_dir(repo).join(name);
    let metadata = std::fs::metadata(&path).ok()?;
    is_executable(&metadata).then_some(path)
}

/// Splits a hook's combined output into the lines worth showing, newest last.
///
/// Blank lines go: hooks pad their output generously, and the card that shows the tail of this has
/// room for three.
pub fn output_lines(stdout: &[u8], stderr: &[u8]) -> Vec<String> {
    let mut lines = Vec::new();
    for chunk in [stdout, stderr] {
        for line in String::from_utf8_lossy(chunk).lines() {
            let trimmed = line.trim_end();
            if !trimmed.trim().is_empty() {
                lines.push(trimmed.to_string());
            }
        }
    }
    lines
}

/// Runs one hook and waits for it, or reports that there was nothing to run.
///
/// The child gets the environment git gives a hook: the working tree as its current directory, and
/// `GIT_DIR` pointing at the repository — plus the login `PATH` (see the module docs).
///
/// A hook that fails is **not** an `Err`: a non-zero exit is a hook doing its job, and the caller
/// needs the output to show the user. `Err` is reserved for not being able to run it at all.
pub fn run_hook(repo: &Repository, name: &str, args: &[&str]) -> Result<HookOutcome, AppError> {
    run_hook_with_stdin(repo, name, args, None)
}

/// [`run_hook`], but feeding `stdin` to the child first when given.
///
/// `pre-push` is the one hook this module runs that takes input on stdin rather than only
/// positional args: git writes one `<local ref> SP <local oid> SP <remote ref> SP <remote oid>`
/// line per ref being pushed. Kept as a separate function from `run_hook` rather than an
/// always-piped stdin on every call: a hook that never reads it (`pre-commit`, `commit-msg`,
/// `post-commit`) has nothing to gain from the extra pipe, and every existing call site stays a
/// one-line call with no `None` to pass.
pub fn run_hook_with_stdin(
    repo: &Repository,
    name: &str,
    args: &[&str],
    stdin: Option<&str>,
) -> Result<HookOutcome, AppError> {
    let Some(hook) = find_hook(repo, name) else {
        return Ok(HookOutcome::absent(name));
    };
    // Only past this point: a repository that does not define the hook has nothing to report, and
    // a "running pre-commit…" card for a hook that was never going to run is worse than silence.
    notify(HookEvent::Started {
        name: name.to_string(),
    });

    let mut command = Command::new(&hook);
    command.args(args);
    command.current_dir(repo.workdir().unwrap_or_else(|| repo.path()));
    command.env("GIT_DIR", repo.path());
    if let Some(path) = login_path() {
        command.env("PATH", path);
    }

    let output = match stdin {
        None => command
            .output()
            .map_err(|e| AppError::Unknown(format!("could not run the {name} hook: {e}")))?,
        Some(input) => {
            command.stdin(Stdio::piped());
            command.stdout(Stdio::piped());
            command.stderr(Stdio::piped());
            let mut child = command
                .spawn()
                .map_err(|e| AppError::Unknown(format!("could not run the {name} hook: {e}")))?;
            // Written from its own thread rather than before `wait_with_output`: a hook that fills
            // its stdout/stderr pipe before it has read all of stdin would otherwise deadlock this
            // process against itself. The ref list here is tiny (one line per pushed ref), so this
            // is not a real-world concern, but it costs nothing to not depend on that.
            let mut stdin_pipe = child
                .stdin
                .take()
                .expect("stdin was requested with Stdio::piped()");
            let input = input.to_string();
            let writer = std::thread::spawn(move || stdin_pipe.write_all(input.as_bytes()));
            let output = child
                .wait_with_output()
                .map_err(|e| AppError::Unknown(format!("could not run the {name} hook: {e}")))?;
            // Best-effort: a hook that exited without reading stdin makes the write fail with a
            // broken pipe, which is the hook's business, not this call's.
            let _ = writer.join();
            output
        }
    };

    notify(HookEvent::Finished {
        name: name.to_string(),
        success: output.status.success(),
    });

    Ok(HookOutcome {
        name: name.to_string(),
        ran: true,
        success: output.status.success(),
        exit_code: output.status.code(),
        output: output_lines(&output.stdout, &output.stderr),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_repo(name: &str) -> (std::path::PathBuf, Repository) {
        let dir = std::env::temp_dir().join(format!("gm-hooks-{name}-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(&dir).unwrap();
        let repo = Repository::init(&dir).unwrap();
        (dir, repo)
    }

    /// Installs an executable hook script.
    fn write_hook(repo: &Repository, name: &str, script: &str) {
        let dir = repo.path().join("hooks");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{script}\n")).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
    }

    // ─── run_hook_with_stdin ────────────────────────────────────────────────────
    // What `pre-push` needs and `pre-commit`/`commit-msg`/`post-commit` do not: input on stdin
    // rather than only positional args.

    #[cfg(unix)]
    #[test]
    fn stdin_reaches_the_hook() {
        let (_dir, repo) = temp_repo("stdin-reaches");
        write_hook(&repo, "pre-push", "cat");

        let outcome =
            run_hook_with_stdin(&repo, "pre-push", &[], Some("refs/heads/main abc123\n")).unwrap();

        assert!(outcome.success);
        assert_eq!(outcome.output, vec!["refs/heads/main abc123"]);
    }

    #[cfg(unix)]
    #[test]
    fn a_hook_that_never_reads_stdin_does_not_hang() {
        // The write happens on its own thread precisely so a hook like this one — which exits
        // immediately without touching stdin — can't deadlock the call.
        let (_dir, repo) = temp_repo("stdin-ignored");
        write_hook(&repo, "pre-push", "exit 0");

        let outcome =
            run_hook_with_stdin(&repo, "pre-push", &[], Some("refs/heads/main abc123\n")).unwrap();

        assert!(outcome.success);
    }

    #[cfg(unix)]
    #[test]
    fn args_and_stdin_both_reach_the_hook() {
        let (_dir, repo) = temp_repo("stdin-and-args");
        write_hook(&repo, "pre-push", "echo \"$1 $2\"; cat");

        let outcome = run_hook_with_stdin(
            &repo,
            "pre-push",
            &["origin", "git@example.com:repo.git"],
            Some("refs/heads/main abc123 refs/heads/main def456\n"),
        )
        .unwrap();

        assert_eq!(
            outcome.output,
            vec![
                "origin git@example.com:repo.git",
                "refs/heads/main abc123 refs/heads/main def456",
            ]
        );
    }

    // ─── reporting a hook while it runs ─────────────────────────────────────────
    // What a "running pre-commit…" card is built on. Without it a slow hook (lint-staged over a
    // big change) is a frozen app: nothing before, everything after.

    /// Collects the events a body reports, with the observer torn down afterwards.
    fn recording<T>(body: impl FnOnce() -> T) -> (T, Vec<HookEvent>) {
        let events = std::rc::Rc::new(RefCell::new(Vec::new()));
        let sink = std::rc::Rc::clone(&events);
        let guard = report_to(move |event| sink.borrow_mut().push(event));
        let value = body();
        drop(guard);
        let collected = events.borrow().clone();
        (value, collected)
    }

    fn names(events: &[HookEvent]) -> Vec<(&str, Option<bool>)> {
        events
            .iter()
            .map(|event| match event {
                HookEvent::Started { name } => (name.as_str(), None),
                HookEvent::Finished { name, success } => (name.as_str(), Some(*success)),
            })
            .collect()
    }

    #[cfg(unix)]
    #[test]
    fn reports_a_hook_starting_and_finishing() {
        let (_dir, repo) = temp_repo("observer-runs");
        write_hook(&repo, "pre-commit", "exit 0");

        let (outcome, events) = recording(|| run_hook(&repo, "pre-commit", &[]).unwrap());

        assert!(outcome.success);
        assert_eq!(
            names(&events),
            vec![("pre-commit", None), ("pre-commit", Some(true))]
        );
    }

    #[cfg(unix)]
    #[test]
    fn reports_a_hook_that_refused() {
        let (_dir, repo) = temp_repo("observer-fails");
        write_hook(&repo, "pre-commit", "exit 1");

        let (_, events) = recording(|| run_hook(&repo, "pre-commit", &[]).unwrap());

        assert_eq!(
            names(&events),
            vec![("pre-commit", None), ("pre-commit", Some(false))]
        );
    }

    #[test]
    fn says_nothing_at_all_about_a_hook_the_repository_does_not_define() {
        // The distinction the card depends on: "running pre-commit…" for a hook that was never
        // going to run is worse than silence, and most repositories define none of these.
        let (_dir, repo) = temp_repo("observer-absent");

        let (outcome, events) = recording(|| run_hook(&repo, "pre-commit", &[]).unwrap());

        assert!(!outcome.ran);
        assert!(events.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn stops_reporting_once_the_guard_is_dropped() {
        // The thread runs other commands afterwards — a pooled blocking thread must not carry an
        // observer into whatever it is reused for.
        let (_dir, repo) = temp_repo("observer-guard");
        write_hook(&repo, "pre-commit", "exit 0");

        let (_, events) = recording(|| run_hook(&repo, "pre-commit", &[]).unwrap());
        assert_eq!(events.len(), 2);

        // Same thread, no observer installed: this must not reach the sink above.
        run_hook(&repo, "pre-commit", &[]).unwrap();
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn an_absent_hook_never_touches_stdin() {
        let (_dir, repo) = temp_repo("stdin-absent");
        let outcome = run_hook_with_stdin(&repo, "pre-push", &[], Some("irrelevant")).unwrap();
        assert!(!outcome.ran);
    }

    #[test]
    fn login_path_is_the_last_line_that_looks_like_a_path() {
        // A profile that greets the user puts its greeting on stdout ahead of the value; taking
        // the whole output would produce a PATH with "Welcome back!" in it.
        let raw = "Welcome back!\nnvm: using node 22\n/usr/local/bin:/usr/bin:/bin";
        assert_eq!(
            parse_login_path(raw).as_deref(),
            Some("/usr/local/bin:/usr/bin:/bin")
        );
    }

    #[test]
    fn login_path_handles_a_shell_that_only_prints_the_value() {
        assert_eq!(
            parse_login_path("/usr/bin:/bin").as_deref(),
            Some("/usr/bin:/bin")
        );
    }

    #[test]
    fn login_path_rejects_output_with_no_path_in_it() {
        // Better to fall back to the app's own PATH than to hand a child a line of prose.
        assert!(parse_login_path("command not found").is_none());
        assert!(parse_login_path("").is_none());
        assert!(parse_login_path("   \n  \n").is_none());
    }

    #[test]
    fn a_relative_hooks_path_resolves_against_the_working_tree() {
        // This is what makes husky v9 (`core.hooksPath = .husky/_`) work; resolving it against the
        // git dir would look inside `.git/` and find nothing.
        let resolved = resolve_hooks_path(
            ".husky/_",
            Some(Path::new("/repo")),
            Path::new("/repo/.git"),
        );
        assert_eq!(resolved, PathBuf::from("/repo/.husky/_"));
    }

    #[test]
    fn an_absolute_hooks_path_is_taken_as_is() {
        let resolved = resolve_hooks_path(
            "/shared/hooks",
            Some(Path::new("/repo")),
            Path::new("/repo/.git"),
        );
        assert_eq!(resolved, PathBuf::from("/shared/hooks"));
    }

    #[test]
    fn a_bare_repository_resolves_against_its_git_dir() {
        let resolved = resolve_hooks_path("hooks", None, Path::new("/repo.git"));
        assert_eq!(resolved, PathBuf::from("/repo.git/hooks"));
    }

    #[test]
    fn output_keeps_both_streams_and_drops_the_padding() {
        let lines = output_lines(b"running lint\n\n", b"  \n\xe2\x9c\x96 2 problems\n");
        assert_eq!(lines, vec!["running lint", "✖ 2 problems"]);
    }

    #[test]
    fn output_is_empty_for_a_silent_hook() {
        assert!(output_lines(b"", b"").is_empty());
    }

    #[test]
    fn an_absent_hook_is_a_success_that_did_not_run() {
        // The distinction matters to the caller: "nothing to do" must not read as "the gate
        // passed", and must not read as a failure either.
        let outcome = HookOutcome::absent("pre-commit");
        assert!(!outcome.ran);
        assert!(outcome.success);
        assert!(outcome.output.is_empty());
    }
}
