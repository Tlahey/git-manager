//! "Is a newer version published?" — answered by shelling out to the repo's own
//! package manager rather than by talking to a registry ourselves.
//!
//! The app makes no outbound calls of its own (see the security conventions in
//! CLAUDE.md), and `pnpm`/`npm` already know the registry, the auth and the proxy
//! settings the user configured. So this module runs `<manager> outdated --json`
//! and normalises the answer. It is deliberately separate from `package_health.rs`:
//! that report is offline and instant, this one is on demand and can be slow.
//!
//! When the manager isn't installed we return `toolMissing` rather than an error —
//! it is a state the UI explains ("install pnpm to use this"), not a failure.

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OutdatedStatus {
    Ok,
    /// The repo's package manager isn't on PATH.
    ToolMissing,
    /// The repo's package manager has no machine-readable `outdated` (yarn, bun).
    Unsupported,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OutdatedPackage {
    pub name: String,
    /// Version currently installed.
    pub current: String,
    /// Newest version the declared range allows — a plain update.
    pub wanted: String,
    /// Newest version published — may be a major bump.
    pub latest: String,
    /// True when `latest` is a major ahead of `current`, so the UI can separate
    /// "run update" from "this needs a migration".
    pub major_update: bool,
    pub deprecated: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OutdatedReport {
    pub package_manager: String,
    pub status: OutdatedStatus,
    pub packages: Vec<OutdatedPackage>,
}

fn empty(package_manager: &str, status: OutdatedStatus) -> OutdatedReport {
    OutdatedReport {
        package_manager: package_manager.to_string(),
        status,
        packages: Vec::new(),
    }
}

/// True when `latest` crosses a major boundary above `current`.
fn is_major_update(current: &str, latest: &str) -> bool {
    let major = |v: &str| {
        v.trim()
            .trim_start_matches('v')
            .split('.')
            .next()
            .and_then(|m| m.parse::<u64>().ok())
    };
    match (major(current), major(latest)) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    }
}

/// Reads one dependency entry, in either the object form pnpm/npm emit or the
/// array form npm uses when a dependency is installed at several versions (we
/// take the first, which is the one npm reports as the primary).
fn parse_entry(name: &str, value: &serde_json::Value) -> Option<OutdatedPackage> {
    let object = match value {
        serde_json::Value::Array(items) => items.first()?,
        other => other,
    };
    let field = |key: &str| object.get(key).and_then(|v| v.as_str()).unwrap_or_default();

    let current = field("current").to_string();
    let latest = field("latest").to_string();
    if latest.is_empty() {
        return None;
    }
    let wanted = field("wanted").to_string();
    Some(OutdatedPackage {
        major_update: is_major_update(&current, &latest),
        deprecated: object
            .get("isDeprecated")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        name: name.to_string(),
        current,
        wanted,
        latest,
    })
}

/// Normalises the JSON both managers emit.
///
/// pnpm and npm both key by dependency name at the top level, but pnpm's recursive
/// mode (`-r`) keys by *package* first and nests the dependencies underneath. We
/// tell them apart by whether an entry looks like a dependency (it has `latest`),
/// so one parser handles every shape and a workspace repo reports all its packages.
fn parse_outdated_json(text: &str) -> Vec<OutdatedPackage> {
    let Ok(root) = serde_json::from_str::<serde_json::Value>(text) else {
        return Vec::new();
    };
    let Some(entries) = root.as_object() else {
        return Vec::new();
    };

    let mut packages: Vec<OutdatedPackage> = Vec::new();
    for (key, value) in entries {
        let looks_like_dependency = matches!(value, serde_json::Value::Array(_))
            || value.get("latest").is_some()
            || value.get("current").is_some();
        if looks_like_dependency {
            if let Some(package) = parse_entry(key, value) {
                packages.push(package);
            }
        } else if let Some(nested) = value.as_object() {
            // A workspace package's own block: recurse one level into its deps.
            for (name, entry) in nested {
                if let Some(package) = parse_entry(name, entry) {
                    packages.push(package);
                }
            }
        }
    }

    // The same dependency can be reported by several workspace packages; keep one
    // row per name so the report reads as a list of libraries, not of declarations.
    packages.sort_by(|a, b| a.name.cmp(&b.name).then(a.current.cmp(&b.current)));
    packages.dedup_by(|a, b| a.name == b.name && a.current == b.current);
    packages
}

/// Arguments that make each manager print JSON, or `None` when it can't.
///
/// yarn v1's `--json` is newline-delimited and yarn 2+ dropped `outdated`
/// entirely; bun has no equivalent. Rather than parse three dialects we report
/// those as unsupported and let the offline checks carry the report.
fn outdated_args(package_manager: &str) -> Option<Vec<&'static str>> {
    match package_manager {
        // `-r` covers every workspace package, not just the root manifest.
        "pnpm" => Some(vec!["outdated", "--format", "json", "-r"]),
        "npm" => Some(vec!["outdated", "--json", "--long"]),
        _ => None,
    }
}

/// Runs `<manager> outdated` in `repo_path` and normalises the result.
pub fn check_outdated(repo_path: &str, package_manager: &str) -> Result<OutdatedReport, String> {
    let Some(args) = outdated_args(package_manager) else {
        return Ok(empty(package_manager, OutdatedStatus::Unsupported));
    };

    let output = match Command::new(package_manager)
        .current_dir(repo_path)
        .args(&args)
        .output()
    {
        Ok(output) => output,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(empty(package_manager, OutdatedStatus::ToolMissing));
        }
        Err(error) => return Err(format!("Failed to run {package_manager} outdated: {error}")),
    };

    // Both managers exit non-zero *because* something is outdated, so the exit
    // code says nothing. Only an empty stdout with a message on stderr is a failure.
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if !output.status.success() && !stderr.trim().is_empty() {
            return Err(format!("{package_manager} outdated: {}", stderr.trim()));
        }
        return Ok(empty(package_manager, OutdatedStatus::Ok));
    }

    Ok(OutdatedReport {
        package_manager: package_manager.to_string(),
        status: OutdatedStatus::Ok,
        packages: parse_outdated_json(&stdout),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_flat_shape_pnpm_and_npm_emit() {
        let json = r#"{
          "react": { "current": "18.2.0", "wanted": "18.3.1", "latest": "19.0.0",
                     "dependencyType": "dependencies" },
          "left-pad": { "current": "1.3.0", "wanted": "1.3.0", "latest": "1.3.1",
                        "isDeprecated": true }
        }"#;
        let packages = parse_outdated_json(json);
        assert_eq!(packages.len(), 2);

        let react = packages.iter().find(|p| p.name == "react").unwrap();
        assert_eq!(react.wanted, "18.3.1");
        assert_eq!(react.latest, "19.0.0");
        assert!(react.major_update);
        assert!(!react.deprecated);

        let left_pad = packages.iter().find(|p| p.name == "left-pad").unwrap();
        assert!(!left_pad.major_update);
        assert!(left_pad.deprecated);
    }

    #[test]
    fn parses_the_nested_shape_pnpm_recursive_emits() {
        let json = r#"{
          "packages/ui": {
            "react": { "current": "18.2.0", "wanted": "18.3.1", "latest": "18.3.1" }
          },
          "apps/desktop": {
            "vite": { "current": "6.0.3", "wanted": "6.1.0", "latest": "7.0.0" }
          }
        }"#;
        let packages = parse_outdated_json(json);
        let names: Vec<&str> = packages.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, vec!["react", "vite"]);
        assert!(
            packages
                .iter()
                .find(|p| p.name == "vite")
                .unwrap()
                .major_update
        );
    }

    #[test]
    fn collapses_one_dependency_reported_by_several_packages() {
        let json = r#"{
          "packages/ui":  { "react": { "current": "18.2.0", "wanted": "18.3.1", "latest": "18.3.1" } },
          "packages/app": { "react": { "current": "18.2.0", "wanted": "18.3.1", "latest": "18.3.1" } }
        }"#;
        assert_eq!(parse_outdated_json(json).len(), 1);
    }

    #[test]
    fn takes_the_first_of_npms_array_form() {
        let json = r#"{
          "typescript": [ { "current": "5.0.0", "wanted": "5.9.0", "latest": "7.0.2" },
                          { "current": "4.9.0", "wanted": "4.9.5", "latest": "7.0.2" } ]
        }"#;
        let packages = parse_outdated_json(json);
        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].current, "5.0.0");
    }

    #[test]
    fn drops_entries_without_a_latest_version() {
        // npm omits `latest` for a git or file dependency it can't resolve.
        let json = r#"{ "linked": { "current": "1.0.0", "wanted": "linked" } }"#;
        assert!(parse_outdated_json(json).is_empty());
    }

    #[test]
    fn malformed_output_yields_no_packages_rather_than_an_error() {
        assert!(parse_outdated_json("not json at all").is_empty());
        assert!(parse_outdated_json("[]").is_empty());
    }

    #[test]
    fn major_update_needs_both_versions_to_parse() {
        assert!(is_major_update("1.0.0", "2.0.0"));
        assert!(!is_major_update("1.0.0", "1.9.9"));
        assert!(!is_major_update("weird", "2.0.0"));
    }

    #[test]
    fn managers_without_machine_readable_outdated_are_reported_unsupported() {
        for manager in ["yarn", "bun", "unknown"] {
            let report = check_outdated(".", manager).unwrap();
            assert_eq!(report.status, OutdatedStatus::Unsupported);
            assert!(report.packages.is_empty());
        }
    }
}
