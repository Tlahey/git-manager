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
#[tauri::command]
pub async fn check_outdated_packages(
    path: String,
    package_manager: String,
) -> Result<OutdatedReport, String> {
    package_outdated::check_outdated(&path, &package_manager)
}

/// Release notes between the installed version and the update target. Best-effort:
/// a package with no resolvable GitHub repo yields an empty changelog, not an error.
#[tauri::command]
pub async fn get_package_changelog(
    path: String,
    name: String,
    from: String,
    to: String,
    token: Option<String>,
) -> Result<PackageChangelog, String> {
    package_changelog::fetch_changelog(&path, &name, &from, &to, token).await
}

/// What this repo imports from a dependency — the usage surface an upgrade-risk
/// judgement is made against. Filesystem-only, no network.
#[tauri::command]
pub async fn scan_package_usage(path: String, name: String) -> Result<PackageUsage, String> {
    package_usage::scan_usage(&path, &name)
}

/// Runs the update. The one mutating command here — it rewrites manifests, the
/// lockfile and `node_modules`, so it is only ever reached from an explicit click.
#[tauri::command]
pub async fn update_packages(
    path: String,
    package_manager: String,
    names: Vec<String>,
    to_latest: bool,
) -> Result<UpdateOutcome, String> {
    package_update::update_packages(&path, &package_manager, names, to_latest)
}
