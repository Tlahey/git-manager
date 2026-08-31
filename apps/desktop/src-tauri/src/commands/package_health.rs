use crate::services::package_changelog::{self, PackageChangelog};
use crate::services::package_health::{self, PackageHealthReport};
use crate::services::package_outdated::{self, OutdatedReport};
use crate::services::package_update::{self, UpdateOutcome};
use crate::services::package_usage::{self, PackageUsage};

/// True when the repo has a root `package.json`, so the UI offers the health
/// check only where it applies.
#[tauri::command]
pub async fn has_package_manifest(path: String) -> Result<bool, String> {
    Ok(package_health::has_package_manifest(&path))
}

/// Runs every offline manifest check (alignment, catalog drift, install state...).
#[tauri::command]
pub async fn run_package_health_check(path: String) -> Result<PackageHealthReport, String> {
    package_health::run_health_check(&path)
}

/// Asks the repo's own package manager which dependencies have newer releases.
/// Separate from the health check because it hits the network and can be slow.
///
/// Runs on a blocking-pool thread: it shells out to the package manager (npm/pnpm/yarn) and
/// blocks on its `output()` for as long as that network call takes — same risk as `fetch_remote`.
#[tauri::command]
pub async fn check_outdated_packages(
    path: String,
    package_manager: String,
) -> Result<OutdatedReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        package_outdated::check_outdated(&path, &package_manager)
    })
    .await
    .map_err(|e| format!("outdated-check task failed to complete: {e}"))?
}

/// Release notes between the installed version and the update target. Best-effort:
/// a package with no resolvable GitHub repo yields an empty changelog, not an error.
///
/// `account_id` is a GitHub login, never a token — `fetch_changelog` resolves the real
/// credential server-side by account id via `services/credential_store.rs`, the same as every
/// other authenticated GitHub call the app makes.
#[tauri::command]
pub async fn get_package_changelog(
    path: String,
    name: String,
    from: String,
    to: String,
    account_id: Option<String>,
) -> Result<PackageChangelog, String> {
    package_changelog::fetch_changelog(&path, &name, &from, &to, account_id).await
}

/// What this repo imports from a dependency — the usage surface an upgrade-risk
/// judgement is made against. Filesystem-only, no network.
#[tauri::command]
pub async fn scan_package_usage(path: String, name: String) -> Result<PackageUsage, String> {
    package_usage::scan_usage(&path, &name)
}

/// Runs the update. The one mutating command here — it rewrites manifests, the
/// lockfile and `node_modules`, so it is only ever reached from an explicit click.
///
/// Runs on a blocking-pool thread — same reasoning as `check_outdated_packages`, plus this one
/// also does real disk I/O across `node_modules`.
#[tauri::command]
pub async fn update_packages(
    path: String,
    package_manager: String,
    names: Vec<String>,
    to_latest: bool,
) -> Result<UpdateOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        package_update::update_packages(&path, &package_manager, names, to_latest)
    })
    .await
    .map_err(|e| format!("package-update task failed to complete: {e}"))?
}
