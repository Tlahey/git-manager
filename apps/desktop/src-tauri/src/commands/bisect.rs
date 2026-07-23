//! `git bisect` commands.
//!
//! Reading the session state is done in git2 (see [`git_bisect`](crate::services::git_bisect)); the
//! mutating actions shell out to the `git` binary — like `run_autosquash` in
//! [`fixup`](super::fixup) — because git's bisection algorithm (midpoint selection across merge
//! topology, skips) is not worth reimplementing on top of libgit2. Every command returns the fresh
//! [`BisectState`] so the frontend can update without a second round-trip.

use crate::error::AppError;
use crate::models::BisectState;
use crate::services::git_bisect;
use git2::Repository;

/// Runs a `git` subcommand in `path`, returning its stdout on success or its stderr as the error.
async fn run_git(app: &tauri::AppHandle, path: &str, args: &[&str]) -> Result<String, String> {
    use tauri_plugin_shell::ShellExt;

    let mut full: Vec<&str> = vec!["-C", path];
    full.extend_from_slice(args);

    let output = app
        .shell()
        .command("git")
        .args(full)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Reads the on-disk bisect state, then — while the search is still running — fills in the
/// remaining revs/steps from `git rev-list --bisect-vars`. Kept out of the git2 service because it
/// needs the `git` binary; the parsing itself is a pure, unit-tested function.
async fn compute_state(app: &tauri::AppHandle, path: &str) -> Result<BisectState, String> {
    let repo = Repository::open(path).map_err(AppError::Git)?;
    let mut state = git_bisect::read_bisect_state(&repo)?;

    let should_estimate = state.active
        && state.first_bad_oid.is_none()
        && state.bad_oid.is_some()
        && !state.good_oids.is_empty();

    if should_estimate {
        // `git rev-list --bisect-vars <bad> --not <good1> <good2> ...`
        let mut args: Vec<&str> = vec!["rev-list", "--bisect-vars"];
        let bad = state.bad_oid.as_deref().unwrap();
        args.push(bad);
        args.push("--not");
        for good in &state.good_oids {
            args.push(good);
        }
        if let Ok(stdout) = run_git(app, path, &args).await {
            let (revs, steps) = git_bisect::parse_bisect_vars(&stdout);
            state.revs_remaining = revs;
            state.steps_remaining = steps;
        }
    }

    Ok(state)
}

/// Returns the repository's current bisect state (idle when no session is running).
#[tauri::command]
pub async fn get_bisect_state(path: String, app: tauri::AppHandle) -> Result<BisectState, String> {
    compute_state(&app, &path).await
}

/// Whether `good_rev` is an ancestor of `bad_rev` — the only valid bisect orientation. The UI calls
/// this before enabling "start" so an inverted or unrelated pair is rejected with a message rather
/// than failing mid-checkout.
#[tauri::command]
pub async fn bisect_check_range(
    path: String,
    bad_rev: String,
    good_rev: String,
) -> Result<bool, String> {
    let repo = Repository::open(&path).map_err(AppError::Git)?;
    git_bisect::is_valid_range(&repo, &bad_rev, &good_rev).map_err(Into::into)
}

/// Starts a bisect session marking `bad_rev` as bad and `good_rev` as good in one shot
/// (`git bisect start <bad> <good>`), which immediately checks out the first commit to test.
#[tauri::command]
pub async fn bisect_start(
    path: String,
    bad_rev: String,
    good_rev: String,
    app: tauri::AppHandle,
) -> Result<BisectState, String> {
    run_git(&app, &path, &["bisect", "start", &bad_rev, &good_rev]).await?;
    compute_state(&app, &path).await
}

/// Marks the commit currently under test (`git bisect <term>`) and advances to the next one.
/// `term` is restricted to `good` / `bad` / `skip` so no arbitrary argument reaches `git`.
#[tauri::command]
pub async fn bisect_mark(
    path: String,
    term: String,
    app: tauri::AppHandle,
) -> Result<BisectState, String> {
    let action = match term.as_str() {
        "good" => "good",
        "bad" => "bad",
        "skip" => "skip",
        other => {
            return Err(AppError::Unknown(format!("invalid bisect term: {other}")).into());
        }
    };
    run_git(&app, &path, &["bisect", action]).await?;
    compute_state(&app, &path).await
}

/// Ends the bisect session (`git bisect reset`), restoring the original branch/HEAD.
#[tauri::command]
pub async fn bisect_reset(path: String, app: tauri::AppHandle) -> Result<BisectState, String> {
    run_git(&app, &path, &["bisect", "reset"]).await?;
    compute_state(&app, &path).await
}
