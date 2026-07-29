//! Offline health check over a JavaScript repo's `package.json` manifests.
//!
//! Answers "is this repo's dependency setup coherent?" from local files only —
//! the manifests, `pnpm-workspace.yaml` and what's actually in `node_modules`. No
//! network: "is there a newer version on the registry?" is a different question,
//! answered on demand by shelling out to the repo's own package manager (see
//! `package_outdated.rs`), because that is where the registry knowledge already
//! lives and the app itself makes no outbound calls.
//!
//! Every check returns **structured** findings, never sentences: all user-facing
//! wording is translated in the frontend from the check `id` and the finding's
//! fields, so a new locale needs no Rust change.

use crate::services::pnpm_workspace;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

/// The manifest fields a dependency can be declared in. `peerDependencies` is
/// read but deliberately excluded from version alignment: a peer range is meant
/// to be wide, so a repo-wide "these disagree" would fire on correct manifests.
const RUNTIME_FIELDS: [&str; 2] = ["dependencies", "devDependencies"];
const ALL_FIELDS: [&str; 4] = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
];

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum HealthSeverity {
    /// The check ran and found nothing.
    Ok,
    /// The check could not run — its prerequisite is missing (e.g. no `node_modules`).
    Skipped,
    Warning,
    Error,
}

/// One place a dependency is declared.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DependencyRef {
    /// Workspace package that declares it (manifest `name`, else the directory).
    pub package: String,
    /// Manifest path relative to the repo root.
    pub path: String,
    /// `dependencies`, `devDependencies`, ...
    pub field: String,
    /// The declared range, verbatim.
    pub range: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HealthFinding {
    pub severity: HealthSeverity,
    /// Dependency the finding is about; `None` for repo-level findings.
    pub dependency: Option<String>,
    /// Every declaration site the finding concerns (one for a local problem,
    /// several for a disagreement between packages).
    pub refs: Vec<DependencyRef>,
    /// What was found (installed version, declared manager...), when the finding
    /// is a comparison.
    pub actual: Option<String>,
    /// What was expected instead.
    pub expected: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    /// Stable id the frontend maps to a translated title and description.
    pub id: String,
    /// Worst severity among `findings`, or `ok`/`skipped` when there are none.
    pub severity: HealthSeverity,
    pub findings: Vec<HealthFinding>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePackage {
    pub name: String,
    /// Manifest path relative to the repo root (`packages/ui/package.json`).
    pub path: String,
    pub version: Option<String>,
    pub private: bool,
    /// Declarations across all four dependency fields.
    pub dependency_count: usize,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PackageHealthReport {
    /// `pnpm` | `npm` | `yarn` | `bun` | `unknown`, from the lockfile on disk.
    pub package_manager: String,
    /// True when the repo declares a pnpm `catalog:`, so the UI can explain the
    /// catalog check rather than showing an empty one.
    pub has_catalog: bool,
    pub packages: Vec<WorkspacePackage>,
    /// Distinct third-party dependency names across the workspace.
    pub dependency_count: usize,
    pub checks: Vec<HealthCheck>,
}

// ─── Manifest discovery ───────────────────────────────────────────────────────

/// A discovered manifest: its relative path, parsed JSON, and directory on disk.
struct Manifest {
    name: String,
    path: String,
    dir: PathBuf,
    json: serde_json::Value,
}

impl Manifest {
    /// Declared dependencies of one field, in manifest order.
    fn deps(&self, field: &str) -> Vec<(String, String)> {
        self.json
            .get(field)
            .and_then(|d| d.as_object())
            .map(|obj| {
                obj.iter()
                    .map(|(name, range)| {
                        (name.clone(), range.as_str().unwrap_or_default().to_string())
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn dependency_ref(&self, field: &str, range: &str) -> DependencyRef {
        DependencyRef {
            package: self.name.clone(),
            path: self.path.clone(),
            field: field.to_string(),
            range: range.to_string(),
        }
    }
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

/// True when the repo has a root `package.json` — the precondition for the whole
/// tool, so the UI can offer it only where it means something.
pub fn has_package_manifest(repo_path: &str) -> bool {
    Path::new(repo_path).join("package.json").exists()
}

/// The lockfile-implied package manager, or `unknown` when there is no lockfile.
fn detect_package_manager(root: &Path) -> String {
    for (lockfile, manager) in [
        ("pnpm-lock.yaml", "pnpm"),
        ("bun.lockb", "bun"),
        ("bun.lock", "bun"),
        ("yarn.lock", "yarn"),
        ("package-lock.json", "npm"),
    ] {
        if root.join(lockfile).exists() {
            return manager.to_string();
        }
    }
    "unknown".to_string()
}

/// Workspace globs, from `pnpm-workspace.yaml` or the `workspaces` field (npm,
/// yarn and bun, which allow either an array or `{ "packages": [...] }`).
fn workspace_globs(root: &Path, root_json: &serde_json::Value) -> Vec<String> {
    let pnpm = pnpm_workspace::block_list(root, "packages");
    if !pnpm.is_empty() {
        return pnpm;
    }
    let workspaces = root_json.get("workspaces");
    let array = match workspaces {
        Some(serde_json::Value::Array(a)) => Some(a),
        Some(obj) => obj.get("packages").and_then(|p| p.as_array()),
        None => None,
    };
    array
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// The root manifest plus every workspace member's, skipping `node_modules`.
fn discover_manifests(root: &Path) -> Result<Vec<Manifest>, String> {
    let root_json = read_json(&root.join("package.json"))
        .ok_or_else(|| "No readable package.json at repo root".to_string())?;

    let mut manifests = vec![build_manifest(root, root, root_json.clone())];
    let mut seen: BTreeSet<String> = manifests.iter().map(|m| m.path.clone()).collect();

    for pattern in workspace_globs(root, &root_json) {
        let full = root.join(&pattern).join("package.json");
        let Ok(entries) = glob::glob(&full.to_string_lossy()) else {
            continue;
        };
        for entry in entries.flatten() {
            if entry.components().any(|c| c.as_os_str() == "node_modules") {
                continue;
            }
            let Some(json) = read_json(&entry) else {
                continue;
            };
            let Some(dir) = entry.parent() else { continue };
            let manifest = build_manifest(root, dir, json);
            if seen.insert(manifest.path.clone()) {
                manifests.push(manifest);
            }
        }
    }

    manifests.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(manifests)
}

fn build_manifest(root: &Path, dir: &Path, json: serde_json::Value) -> Manifest {
    let relative = dir.strip_prefix(root).unwrap_or(dir);
    let path = if relative.as_os_str().is_empty() {
        "package.json".to_string()
    } else {
        format!("{}/package.json", relative.to_string_lossy())
    };
    let name = json
        .get("name")
        .and_then(|n| n.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| {
            dir.file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "package.json".to_string())
        });
    Manifest {
        name,
        path,
        dir: dir.to_path_buf(),
        json,
    }
}

// ─── Version ranges ───────────────────────────────────────────────────────────

/// A range that points somewhere other than the registry — a sibling package, the
/// catalog, a tarball, a git URL. Version arithmetic doesn't apply to these.
fn is_indirect_range(range: &str) -> bool {
    const PREFIXES: [&str; 9] = [
        "workspace:",
        "catalog:",
        "npm:",
        "file:",
        "link:",
        "git+",
        "git:",
        "http:",
        "https:",
    ];
    PREFIXES.iter().any(|p| range.starts_with(p))
}

fn parse_version(version: &str) -> Option<(u64, u64, u64)> {
    let version = version.trim().trim_start_matches('v');
    // A prerelease or build tag makes comparison subtle enough that guessing is
    // worse than staying quiet, so callers treat `None` as "can't tell".
    if version.contains('-') || version.contains('+') {
        return None;
    }
    let mut parts = version.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

/// Whether `version` satisfies `range`, for the simple forms manifests actually
/// use (`^x.y.z`, `~x.y.z`, `>=x.y.z`, exact, `*`).
///
/// Returns `None` for anything else — unions, hyphen ranges, prereleases, indirect
/// protocols — so a caller reports nothing rather than a wrong mismatch. False
/// silence is cheap here; a false "your install is broken" is not.
fn satisfies(version: &str, range: &str) -> Option<bool> {
    let range = range.trim();
    if range.is_empty() || range == "*" || range == "latest" || range == "x" {
        return Some(true);
    }
    if is_indirect_range(range) || range.contains("||") || range.contains(' ') {
        return None;
    }

    let installed = parse_version(version)?;
    let (operator, rest) = match range {
        r if r.starts_with(">=") => (">=", &r[2..]),
        r if r.starts_with('^') => ("^", &r[1..]),
        r if r.starts_with('~') => ("~", &r[1..]),
        r if r.starts_with('=') => ("=", &r[1..]),
        r if r.starts_with(|c: char| c.is_ascii_digit() || c == 'v') => ("=", r),
        _ => return None,
    };
    let base = parse_version(rest)?;

    Some(match operator {
        "=" => installed == base,
        ">=" => installed >= base,
        // Caret allows changes that don't modify the left-most non-zero component.
        "^" => {
            installed >= base
                && match base {
                    (0, 0, _) => installed.0 == 0 && installed.1 == 0 && installed.2 == base.2,
                    (0, minor, _) => installed.0 == 0 && installed.1 == minor,
                    (major, _, _) => installed.0 == major,
                }
        }
        // Tilde allows patch-level changes within the given minor.
        "~" => installed >= base && installed.0 == base.0 && installed.1 == base.1,
        _ => return None,
    })
}

// ─── Installed packages ───────────────────────────────────────────────────────

/// Resolved version of `name` as installed for `manifest`, looking in the
/// package's own `node_modules` first (pnpm's per-package symlinks) then the
/// root's (hoisted / npm / yarn layouts).
fn installed_version(root: &Path, manifest_dir: &Path, name: &str) -> Option<String> {
    for base in [manifest_dir, root] {
        let mut dir = base.join("node_modules");
        for segment in name.split('/') {
            dir = dir.join(segment);
        }
        if let Some(version) = read_json(&dir.join("package.json"))
            .and_then(|p| p.get("version")?.as_str().map(str::to_string))
        {
            return Some(version);
        }
    }
    None
}

// ─── Checks ───────────────────────────────────────────────────────────────────

fn build_check(id: &str, findings: Vec<HealthFinding>) -> HealthCheck {
    let severity = findings
        .iter()
        .map(|f| f.severity)
        .max()
        .unwrap_or(HealthSeverity::Ok);
    HealthCheck {
        id: id.to_string(),
        severity,
        findings,
    }
}

fn skipped_check(id: &str) -> HealthCheck {
    HealthCheck {
        id: id.to_string(),
        severity: HealthSeverity::Skipped,
        findings: Vec::new(),
    }
}

fn finding(
    severity: HealthSeverity,
    dependency: &str,
    refs: Vec<DependencyRef>,
    actual: Option<String>,
    expected: Option<String>,
) -> HealthFinding {
    HealthFinding {
        severity,
        dependency: Some(dependency.to_string()),
        refs,
        actual,
        expected,
    }
}

/// The same dependency pinned to different ranges in different packages — the
/// classic monorepo drift, and the one that silently ships two copies of a library.
fn check_version_alignment(manifests: &[Manifest]) -> HealthCheck {
    let mut by_dependency: BTreeMap<String, Vec<DependencyRef>> = BTreeMap::new();
    for manifest in manifests {
        for field in RUNTIME_FIELDS {
            for (name, range) in manifest.deps(field) {
                // A sibling package and a catalog reference are aligned by
                // construction; comparing their literal text would be noise.
                if range.starts_with("workspace:") || range.starts_with("catalog:") {
                    continue;
                }
                by_dependency
                    .entry(name)
                    .or_default()
                    .push(manifest.dependency_ref(field, &range));
            }
        }
    }

    let findings = by_dependency
        .into_iter()
        .filter_map(|(name, refs)| {
            let ranges: BTreeSet<&str> = refs.iter().map(|r| r.range.as_str()).collect();
            if ranges.len() < 2 {
                return None;
            }
            let expected = ranges.into_iter().collect::<Vec<_>>().join(", ");
            Some(finding(
                HealthSeverity::Warning,
                &name,
                refs,
                Some(expected),
                None,
            ))
        })
        .collect();

    build_check("versionAlignment", findings)
}

/// A dependency the pnpm catalog already defines, declared with a literal range
/// somewhere — the declaration that will drift the next time the catalog moves.
fn check_catalog_drift(manifests: &[Manifest], catalog: &BTreeMap<String, String>) -> HealthCheck {
    if catalog.is_empty() {
        return skipped_check("catalogDrift");
    }
    let mut findings = Vec::new();
    for manifest in manifests {
        for field in RUNTIME_FIELDS {
            for (name, range) in manifest.deps(field) {
                if range.starts_with("catalog:") {
                    continue;
                }
                let Some(catalog_range) = catalog.get(&name) else {
                    continue;
                };
                // Both sides raw: `expected` is what the catalog pins, not a
                // sentence about it. Composing "catalog: (…)" here produced a line
                // that read `^3.0.7 → expected catalog: (^3.0.7)` whenever the two
                // ranges agreed — which looks like a no-op and hid the real point,
                // that the *declaration* should be `catalog:` whatever the versions.
                findings.push(finding(
                    HealthSeverity::Warning,
                    &name,
                    vec![manifest.dependency_ref(field, &range)],
                    Some(range.clone()),
                    Some(catalog_range.clone()),
                ));
            }
        }
    }
    build_check("catalogDrift", findings)
}

/// A sibling workspace package depended on by version instead of `workspace:` —
/// which resolves against the registry and can install a stale published copy.
fn check_workspace_protocol(manifests: &[Manifest]) -> HealthCheck {
    let local: BTreeSet<&str> = manifests.iter().map(|m| m.name.as_str()).collect();
    let mut findings = Vec::new();
    for manifest in manifests {
        for field in ALL_FIELDS {
            for (name, range) in manifest.deps(field) {
                if !local.contains(name.as_str()) || range.starts_with("workspace:") {
                    continue;
                }
                findings.push(finding(
                    HealthSeverity::Warning,
                    &name,
                    vec![manifest.dependency_ref(field, &range)],
                    Some(range.clone()),
                    Some("workspace:*".to_string()),
                ));
            }
        }
    }
    build_check("workspaceProtocol", findings)
}

/// The same dependency in both `dependencies` and `devDependencies` of one
/// manifest — whichever wins is up to the package manager, so it's a real bug.
fn check_duplicate_fields(manifests: &[Manifest]) -> HealthCheck {
    let mut findings = Vec::new();
    for manifest in manifests {
        let runtime = manifest.deps("dependencies");
        let dev: BTreeMap<String, String> = manifest.deps("devDependencies").into_iter().collect();
        for (name, range) in runtime {
            let Some(dev_range) = dev.get(&name) else {
                continue;
            };
            findings.push(finding(
                HealthSeverity::Error,
                &name,
                vec![
                    manifest.dependency_ref("dependencies", &range),
                    manifest.dependency_ref("devDependencies", dev_range),
                ],
                None,
                None,
            ));
        }
    }
    build_check("duplicateDependency", findings)
}

/// Declared but absent from `node_modules`, and installed-but-outside-its-range —
/// the two ways an install can disagree with the manifests. Both are skipped
/// wholesale when nothing is installed, since "you haven't run install" is one
/// fact, not one finding per dependency.
fn check_install_state(root: &Path, manifests: &[Manifest]) -> (HealthCheck, HealthCheck) {
    if !root.join("node_modules").exists() {
        return (
            skipped_check("missingInstall"),
            skipped_check("rangeMismatch"),
        );
    }

    let mut missing = Vec::new();
    let mut mismatched = Vec::new();
    for manifest in manifests {
        for field in RUNTIME_FIELDS {
            for (name, range) in manifest.deps(field) {
                if is_indirect_range(&range) {
                    continue;
                }
                let dependency_ref = manifest.dependency_ref(field, &range);
                let Some(version) = installed_version(root, &manifest.dir, &name) else {
                    missing.push(finding(
                        HealthSeverity::Error,
                        &name,
                        vec![dependency_ref],
                        None,
                        Some(range.clone()),
                    ));
                    continue;
                };
                if satisfies(&version, &range) == Some(false) {
                    mismatched.push(finding(
                        HealthSeverity::Error,
                        &name,
                        vec![dependency_ref],
                        Some(version),
                        Some(range.clone()),
                    ));
                }
            }
        }
    }

    (
        build_check("missingInstall", missing),
        build_check("rangeMismatch", mismatched),
    )
}

/// The root `packageManager` field against the lockfile on disk — the field Corepack
/// enforces, so a mismatch means contributors install with a different tool.
fn check_package_manager_field(root_json: &serde_json::Value, detected: &str) -> HealthCheck {
    let declared = root_json.get("packageManager").and_then(|v| v.as_str());
    let mut findings = Vec::new();

    match declared {
        None => {
            if detected != "unknown" {
                findings.push(HealthFinding {
                    severity: HealthSeverity::Warning,
                    dependency: None,
                    refs: Vec::new(),
                    actual: None,
                    expected: Some(detected.to_string()),
                });
            }
        }
        Some(value) => {
            let declared_name = value.split('@').next().unwrap_or_default();
            if detected != "unknown" && declared_name != detected {
                findings.push(HealthFinding {
                    severity: HealthSeverity::Error,
                    dependency: None,
                    refs: Vec::new(),
                    actual: Some(value.to_string()),
                    expected: Some(detected.to_string()),
                });
            }
        }
    }

    build_check("packageManagerField", findings)
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/// Runs every offline check over the repo's manifests.
pub fn run_health_check(repo_path: &str) -> Result<PackageHealthReport, String> {
    let root = Path::new(repo_path);
    let manifests = discover_manifests(root)?;
    let root_json = manifests
        .iter()
        .find(|m| m.path == "package.json")
        .map(|m| m.json.clone())
        .unwrap_or(serde_json::Value::Null);

    let package_manager = detect_package_manager(root);
    let catalog = if package_manager == "pnpm" {
        pnpm_workspace::block_map(root, "catalog")
    } else {
        BTreeMap::new()
    };

    let (missing_install, range_mismatch) = check_install_state(root, &manifests);
    let checks = vec![
        check_version_alignment(&manifests),
        check_catalog_drift(&manifests, &catalog),
        check_workspace_protocol(&manifests),
        check_duplicate_fields(&manifests),
        missing_install,
        range_mismatch,
        check_package_manager_field(&root_json, &package_manager),
    ];

    let local: BTreeSet<&str> = manifests.iter().map(|m| m.name.as_str()).collect();
    let mut third_party: BTreeSet<String> = BTreeSet::new();
    let packages = manifests
        .iter()
        .map(|manifest| {
            let mut dependency_count = 0;
            for field in ALL_FIELDS {
                for (name, _) in manifest.deps(field) {
                    dependency_count += 1;
                    if !local.contains(name.as_str()) {
                        third_party.insert(name);
                    }
                }
            }
            WorkspacePackage {
                name: manifest.name.clone(),
                path: manifest.path.clone(),
                version: manifest
                    .json
                    .get("version")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                private: manifest
                    .json
                    .get("private")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false),
                dependency_count,
            }
        })
        .collect();

    Ok(PackageHealthReport {
        package_manager,
        has_catalog: !catalog.is_empty(),
        packages,
        dependency_count: third_party.len(),
        checks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("gm-pkghealth-{}-{}", name, std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(path: PathBuf, contents: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    fn check<'a>(report: &'a PackageHealthReport, id: &str) -> &'a HealthCheck {
        report.checks.iter().find(|c| c.id == id).unwrap()
    }

    /// A pnpm workspace: root + two members, wired with the drift each check looks for.
    fn workspace(name: &str) -> PathBuf {
        let dir = tmp(name);
        write(dir.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
        write(
            dir.join("pnpm-workspace.yaml"),
            "packages:\n  - \"packages/*\"\ncatalog:\n  typescript: ^7.0.2\n",
        );
        write(
            dir.join("package.json"),
            r#"{"name":"root","private":true,"packageManager":"pnpm@11.12.0",
                "devDependencies":{"typescript":"catalog:"}}"#,
        );
        write(
            dir.join("packages/ui/package.json"),
            r#"{"name":"@app/ui","version":"1.0.0","dependencies":{"react":"^18.3.1"},
                "devDependencies":{"typescript":"^7.0.2"}}"#,
        );
        write(
            dir.join("packages/app/package.json"),
            r#"{"name":"@app/app","version":"1.0.0",
                "dependencies":{"react":"^18.2.0","@app/ui":"^1.0.0"}}"#,
        );
        dir
    }

    #[test]
    fn discovers_root_and_workspace_members() {
        let dir = workspace("discover");
        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        let paths: Vec<&str> = report.packages.iter().map(|p| p.path.as_str()).collect();
        assert_eq!(
            paths,
            vec![
                "package.json",
                "packages/app/package.json",
                "packages/ui/package.json"
            ]
        );
        assert_eq!(report.package_manager, "pnpm");
        assert!(report.has_catalog);
        // react + typescript, with the sibling @app/ui excluded as local.
        assert_eq!(report.dependency_count, 2);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn flags_a_dependency_pinned_to_two_ranges() {
        let dir = workspace("align");
        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        let alignment = check(&report, "versionAlignment");
        assert_eq!(alignment.severity, HealthSeverity::Warning);
        assert_eq!(alignment.findings.len(), 1);
        let react = &alignment.findings[0];
        assert_eq!(react.dependency.as_deref(), Some("react"));
        assert_eq!(react.refs.len(), 2);
        assert_eq!(react.actual.as_deref(), Some("^18.2.0, ^18.3.1"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn flags_a_literal_range_the_catalog_already_defines() {
        let dir = workspace("catalog");
        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        let drift = check(&report, "catalogDrift");
        // The root uses `catalog:` correctly; only packages/ui's literal range drifts.
        assert_eq!(drift.findings.len(), 1);
        assert_eq!(drift.findings[0].dependency.as_deref(), Some("typescript"));
        assert_eq!(drift.findings[0].refs[0].package, "@app/ui");
        // Declared range and catalog range, both raw — the frontend writes the sentence.
        assert_eq!(drift.findings[0].actual.as_deref(), Some("^7.0.2"));
        assert_eq!(drift.findings[0].expected.as_deref(), Some("^7.0.2"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn flags_a_sibling_package_depended_on_by_version() {
        let dir = workspace("protocol");
        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        let protocol = check(&report, "workspaceProtocol");
        assert_eq!(protocol.findings.len(), 1);
        assert_eq!(protocol.findings[0].dependency.as_deref(), Some("@app/ui"));
        assert_eq!(
            protocol.findings[0].expected.as_deref(),
            Some("workspace:*")
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn flags_a_dependency_declared_in_both_dependency_fields() {
        let dir = tmp("duplicate");
        write(
            dir.join("package.json"),
            r#"{"name":"root","dependencies":{"lodash":"^4.0.0"},
                "devDependencies":{"lodash":"^4.17.0"}}"#,
        );
        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        let duplicates = check(&report, "duplicateDependency");
        assert_eq!(duplicates.severity, HealthSeverity::Error);
        assert_eq!(duplicates.findings[0].refs.len(), 2);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn install_checks_are_skipped_without_node_modules() {
        let dir = workspace("no-install");
        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        assert_eq!(
            check(&report, "missingInstall").severity,
            HealthSeverity::Skipped
        );
        assert_eq!(
            check(&report, "rangeMismatch").severity,
            HealthSeverity::Skipped
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn separates_a_missing_install_from_a_version_outside_its_range() {
        let dir = tmp("install-state");
        write(
            dir.join("package.json"),
            r#"{"name":"root","dependencies":{"left-pad":"^1.3.0","absent":"^2.0.0",
                "stale":"^3.0.0","local":"workspace:*"}}"#,
        );
        write(
            dir.join("node_modules/left-pad/package.json"),
            r#"{"version":"1.3.1"}"#,
        );
        write(
            dir.join("node_modules/stale/package.json"),
            r#"{"version":"2.9.0"}"#,
        );

        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        let missing = check(&report, "missingInstall");
        assert_eq!(missing.findings.len(), 1);
        assert_eq!(missing.findings[0].dependency.as_deref(), Some("absent"));

        let mismatch = check(&report, "rangeMismatch");
        assert_eq!(mismatch.findings.len(), 1);
        assert_eq!(mismatch.findings[0].dependency.as_deref(), Some("stale"));
        assert_eq!(mismatch.findings[0].actual.as_deref(), Some("2.9.0"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn flags_a_package_manager_field_disagreeing_with_the_lockfile() {
        let dir = tmp("pm-field");
        write(dir.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
        write(
            dir.join("package.json"),
            r#"{"name":"root","packageManager":"npm@10.0.0"}"#,
        );
        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        let field = check(&report, "packageManagerField");
        assert_eq!(field.severity, HealthSeverity::Error);
        assert_eq!(field.findings[0].actual.as_deref(), Some("npm@10.0.0"));
        assert_eq!(field.findings[0].expected.as_deref(), Some("pnpm"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_matching_package_manager_field_passes() {
        let dir = workspace("pm-ok");
        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        assert_eq!(
            check(&report, "packageManagerField").severity,
            HealthSeverity::Ok
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reads_npm_style_workspaces_field() {
        let dir = tmp("npm-workspaces");
        write(dir.join("package-lock.json"), "{}");
        write(
            dir.join("package.json"),
            r#"{"name":"root","workspaces":["apps/*"]}"#,
        );
        write(dir.join("apps/web/package.json"), r#"{"name":"web"}"#);
        let report = run_health_check(dir.to_str().unwrap()).unwrap();
        assert_eq!(report.package_manager, "npm");
        assert_eq!(report.packages.len(), 2);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn errors_without_a_root_manifest() {
        let dir = tmp("no-manifest");
        assert!(!has_package_manifest(dir.to_str().unwrap()));
        assert!(run_health_check(dir.to_str().unwrap()).is_err());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn caret_ranges_follow_the_left_most_non_zero_component() {
        assert_eq!(satisfies("1.5.0", "^1.2.3"), Some(true));
        assert_eq!(satisfies("2.0.0", "^1.2.3"), Some(false));
        assert_eq!(satisfies("1.2.2", "^1.2.3"), Some(false));
        // Below 1.0.0 the caret tightens: ^0.2.3 stays on 0.2.x, ^0.0.3 is exact.
        assert_eq!(satisfies("0.2.9", "^0.2.3"), Some(true));
        assert_eq!(satisfies("0.3.0", "^0.2.3"), Some(false));
        assert_eq!(satisfies("0.0.4", "^0.0.3"), Some(false));
    }

    #[test]
    fn tilde_exact_and_wildcard_ranges() {
        assert_eq!(satisfies("1.2.9", "~1.2.3"), Some(true));
        assert_eq!(satisfies("1.3.0", "~1.2.3"), Some(false));
        assert_eq!(satisfies("1.2.3", "1.2.3"), Some(true));
        assert_eq!(satisfies("1.2.4", "1.2.3"), Some(false));
        assert_eq!(satisfies("9.9.9", "*"), Some(true));
        assert_eq!(satisfies("1.0.0", ">=1.0.0"), Some(true));
        assert_eq!(satisfies("0.9.0", ">=1.0.0"), Some(false));
    }

    #[test]
    fn unmodelled_ranges_report_nothing_rather_than_guess() {
        for range in ["^1 || ^2", ">=1.0.0 <2.0.0", "npm:foo@^1", "workspace:*"] {
            assert_eq!(satisfies("1.0.0", range), None, "range {range}");
        }
        // A prerelease on either side is equally out of scope.
        assert_eq!(satisfies("1.0.0-beta.1", "^1.0.0"), None);
        assert_eq!(satisfies("1.0.0", "^1.0.0-beta.1"), None);
    }
}
