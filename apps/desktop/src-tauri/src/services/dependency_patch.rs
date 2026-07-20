//! Dependency (node_modules) patching via pnpm's official `patch` / `patch-commit`.
//!
//! Editing an installed package under `node_modules/` is invisible to git (the
//! folder is gitignored) and, under pnpm, risky to do in place (store hardlinks).
//! pnpm's `patch` workflow is the supported path: it materialises a pristine copy
//! of the package, you edit it, and `patch-commit` writes a correctly-formatted
//! patch file under `patches/` **and** wires `patchedDependencies` into
//! `pnpm-workspace.yaml` (pnpm 9+) or `package.json` (older pnpm) so the change
//! survives reinstalls.
//!
//! We drive that workflow so a user can capture edits they already made in
//! `node_modules/<pkg>`: materialise pristine into an edit dir we own
//! (`pnpm patch --edit-dir`), copy the live (edited) package over it, show the
//! diff, then `patch-commit` on confirm.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PatchableDependency {
    pub name: String,
    /// Resolved version from `node_modules/<name>/package.json`, or the range from
    /// `package.json` when the package isn't installed.
    pub version: String,
    pub installed: bool,
    /// True when `patchedDependencies` (in `pnpm-workspace.yaml` or `package.json`)
    /// already has an entry for this package.
    pub patched: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreparedDependencyPatch {
    /// The pnpm edit directory, now holding the live (edited) package. Pass it
    /// back to `commit_dependency_patch` to finalise.
    pub edit_dir: String,
    /// Unified diff of the live package versus pristine, for preview only.
    pub diff: String,
    /// True when the live package is byte-identical to pristine (nothing to patch).
    pub unchanged: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommittedDependencyPatch {
    /// Path (relative to the repo) of the written patch file.
    pub patch_file: String,
    /// The `pnpm.patchedDependencies` key that was wired (`<name>@<version>`).
    pub key: String,
}

/// True when the repo uses pnpm (has a `pnpm-lock.yaml`).
pub fn is_pnpm_repo(repo_path: &str) -> bool {
    Path::new(repo_path).join("pnpm-lock.yaml").exists()
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// Directory of an installed dependency, honouring scoped names (`@scope/name`).
fn dependency_dir(repo_path: &str, name: &str) -> PathBuf {
    let mut dir = Path::new(repo_path).join("node_modules");
    for segment in name.split('/') {
        dir = dir.join(segment);
    }
    dir
}

/// Lists dependencies + devDependencies from the root `package.json`, resolving
/// installed versions and flagging any that are already patched (via either
/// `package.json` or `pnpm-workspace.yaml`, depending on the pnpm version).
pub fn list_patchable_dependencies(repo_path: &str) -> Result<Vec<PatchableDependency>, String> {
    let pkg_path = Path::new(repo_path).join("package.json");
    let pkg =
        read_json(&pkg_path).ok_or_else(|| "No readable package.json at repo root".to_string())?;

    let patched_keys: Vec<String> = patched_map(repo_path).into_keys().collect();

    let mut deps: Vec<PatchableDependency> = Vec::new();
    for field in ["dependencies", "devDependencies"] {
        let Some(obj) = pkg.get(field).and_then(|d| d.as_object()) else {
            continue;
        };
        for (name, range) in obj {
            let installed_pkg = read_json(&dependency_dir(repo_path, name).join("package.json"));
            let installed = installed_pkg.is_some();
            let version = installed_pkg
                .as_ref()
                .and_then(|p| p.get("version"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| range.as_str().unwrap_or("").to_string());
            let patched = patched_keys
                .iter()
                .any(|k| k == name || k.starts_with(&format!("{name}@")));
            deps.push(PatchableDependency {
                name: name.clone(),
                version,
                installed,
                patched,
            });
        }
    }
    deps.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(deps)
}

/// Recursively copies `src` into `dst`, overwriting files, skipping nested
/// `node_modules` (a package's own deps aren't part of its patch).
fn copy_dir_over(src: &Path, dst: &Path) -> std::io::Result<()> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == "node_modules" {
            continue;
        }
        let from = entry.path();
        let to = dst.join(&name);
        if entry.file_type()?.is_dir() {
            std::fs::create_dir_all(&to)?;
            copy_dir_over(&from, &to)?;
        } else {
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Unified diff between two directories, via `git diff --no-index` (display only).
///
/// `git` prefixes each path with the (absolute, temp) directory it was given, so
/// the raw output reads `a/private/tmp/…/lib/x.js`. We strip both directory
/// prefixes back down to the package-relative path (`a/lib/x.js`) so the preview
/// and file list read cleanly.
fn diff_dirs(pristine: &Path, edited: &Path) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", "--no-index", "--"])
        .arg(pristine)
        .arg(edited)
        .output()
        .map_err(|e| format!("Failed to diff dependency dirs: {e}"))?;
    // `--no-index` exits 1 when the dirs differ; only >=2 is a real failure.
    if output.stdout.is_empty() && !output.stderr.is_empty() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    for dir in [pristine, edited] {
        // git strips the leading '/', so `a/<abs-without-leading-slash>/file`.
        let prefix = format!("{}/", dir.to_string_lossy().trim_start_matches('/'));
        text = text.replace(&prefix, "");
    }
    Ok(text)
}

fn run_pnpm(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("pnpm")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run pnpm: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("pnpm {}: {}{}", args.join(" "), stdout, stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Materialises pristine into an edit dir, overlays the live (edited) package,
/// and returns the diff so the user can review before committing.
pub fn prepare_dependency_patch(
    repo_path: &str,
    name: &str,
    version: &str,
) -> Result<PreparedDependencyPatch, String> {
    if !is_pnpm_repo(repo_path) {
        return Err("Dependency patching currently supports pnpm repositories only".to_string());
    }
    let live = dependency_dir(repo_path, name);
    if !live.exists() {
        return Err(format!("{name} is not installed under node_modules"));
    }
    let live = std::fs::canonicalize(&live).map_err(|e| format!("Cannot resolve {name}: {e}"))?;

    // Edit dir owned by us so we don't have to parse pnpm's stdout for the path.
    let edit_dir = std::env::temp_dir().join(format!(
        "gm-dep-patch-{}-{}",
        name.replace(['/', '@'], "_"),
        std::process::id()
    ));
    std::fs::remove_dir_all(&edit_dir).ok();
    std::fs::create_dir_all(&edit_dir).map_err(|e| format!("Cannot create edit dir: {e}"))?;
    let edit_dir_str = edit_dir.to_string_lossy().to_string();

    run_pnpm(
        repo_path,
        &[
            "patch",
            &format!("{name}@{version}"),
            "--edit-dir",
            &edit_dir_str,
        ],
    )?;

    // Snapshot pristine, then overlay the live edits so patch-commit captures them.
    let pristine_snap = edit_dir.with_extension("pristine");
    std::fs::remove_dir_all(&pristine_snap).ok();
    std::fs::create_dir_all(&pristine_snap)
        .map_err(|e| format!("Cannot snapshot pristine: {e}"))?;
    copy_dir_over(&edit_dir, &pristine_snap)
        .map_err(|e| format!("Cannot snapshot pristine: {e}"))?;
    copy_dir_over(&live, &edit_dir).map_err(|e| format!("Cannot overlay live package: {e}"))?;

    let diff = diff_dirs(&pristine_snap, &edit_dir)?;
    std::fs::remove_dir_all(&pristine_snap).ok();

    Ok(PreparedDependencyPatch {
        edit_dir: edit_dir_str,
        unchanged: diff.trim().is_empty(),
        diff,
    })
}

/// Finalises a prepared edit dir: pnpm writes the patch file under `patches/`
/// and wires `patchedDependencies` into `pnpm-workspace.yaml` (pnpm 9+) or
/// `package.json` (older pnpm) so the change survives reinstalls.
pub fn commit_dependency_patch(
    repo_path: &str,
    edit_dir: &str,
) -> Result<CommittedDependencyPatch, String> {
    let before = patched_map(repo_path);
    run_pnpm(repo_path, &["patch-commit", edit_dir])?;
    std::fs::remove_dir_all(edit_dir).ok();

    // Discover which key/patch pnpm just wrote by diffing the map.
    let after = patched_map(repo_path);
    let (key, patch_file) = after
        .into_iter()
        .find(|(k, v)| before.get(k).map(|b| b != v).unwrap_or(true))
        .ok_or_else(|| "pnpm patch-commit did not update patchedDependencies".to_string())?;

    Ok(CommittedDependencyPatch { patch_file, key })
}

/// Current `patchedDependencies` as a key→patch-file map, merged from both places
/// pnpm may keep it: `package.json` (`pnpm.patchedDependencies`, older pnpm) and
/// `pnpm-workspace.yaml` (`patchedDependencies`, pnpm 9+). A workspace entry wins
/// on conflict since that's where current pnpm writes.
fn patched_map(repo_path: &str) -> std::collections::BTreeMap<String, String> {
    let mut map: std::collections::BTreeMap<String, String> = std::collections::BTreeMap::new();

    if let Some(pkg) = read_json(&Path::new(repo_path).join("package.json")) {
        if let Some(obj) = pkg
            .get("pnpm")
            .and_then(|x| x.get("patchedDependencies"))
            .and_then(|d| d.as_object())
        {
            for (k, v) in obj {
                map.insert(k.clone(), v.as_str().unwrap_or("").to_string());
            }
        }
    }

    map.extend(parse_workspace_patched(repo_path));
    map
}

/// Minimal reader for the top-level `patchedDependencies:` block of
/// `pnpm-workspace.yaml` (avoids pulling in a YAML dependency for one flat map).
fn parse_workspace_patched(repo_path: &str) -> std::collections::BTreeMap<String, String> {
    let mut map = std::collections::BTreeMap::new();
    let text = match std::fs::read_to_string(Path::new(repo_path).join("pnpm-workspace.yaml")) {
        Ok(t) => t,
        Err(_) => return map,
    };

    let mut in_block = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.is_empty() {
            continue;
        }
        if !in_block {
            // Top-level (unindented) `patchedDependencies:` opens the block.
            if line.starts_with("patchedDependencies:") {
                in_block = true;
            }
            continue;
        }
        // A dedented (unindented) line ends the block.
        if !line.starts_with([' ', '\t']) {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            let key = k.trim().trim_matches(['"', '\'']).to_string();
            let val = v.trim().trim_matches(['"', '\'']).to_string();
            if !key.is_empty() {
                map.insert(key, val);
            }
        }
    }
    map
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("gm-deppatch-{}-{}", name, std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_deps_with_installed_version_and_patched_flag() {
        let dir = tmp("list");
        fs::write(
            dir.join("package.json"),
            r#"{
              "dependencies": { "left-pad": "^1.0.0", "missing-pkg": "^2.0.0" },
              "devDependencies": { "typescript": "5.0.0" },
              "pnpm": { "patchedDependencies": { "left-pad@1.3.0": "patches/left-pad@1.3.0.patch" } }
            }"#,
        )
        .unwrap();
        fs::create_dir_all(dir.join("node_modules/left-pad")).unwrap();
        fs::write(
            dir.join("node_modules/left-pad/package.json"),
            r#"{"version":"1.3.0"}"#,
        )
        .unwrap();
        fs::create_dir_all(dir.join("node_modules/typescript")).unwrap();
        fs::write(
            dir.join("node_modules/typescript/package.json"),
            r#"{"version":"5.0.0"}"#,
        )
        .unwrap();

        let deps = list_patchable_dependencies(dir.to_str().unwrap()).unwrap();
        let left = deps.iter().find(|d| d.name == "left-pad").unwrap();
        assert_eq!(left.version, "1.3.0");
        assert!(left.installed);
        assert!(left.patched);
        let missing = deps.iter().find(|d| d.name == "missing-pkg").unwrap();
        assert!(!missing.installed);
        assert_eq!(missing.version, "^2.0.0");
        let ts = deps.iter().find(|d| d.name == "typescript").unwrap();
        assert!(!ts.patched);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn dependency_dir_handles_scoped_names() {
        let d = dependency_dir("/repo", "@scope/pkg");
        assert!(d.ends_with("node_modules/@scope/pkg"));
    }

    #[test]
    fn copy_dir_over_overwrites_and_skips_node_modules() {
        let src = tmp("copy-src");
        let dst = tmp("copy-dst");
        fs::write(src.join("index.js"), "edited\n").unwrap();
        fs::create_dir_all(src.join("node_modules/dep")).unwrap();
        fs::write(src.join("node_modules/dep/x.js"), "nested\n").unwrap();
        fs::write(dst.join("index.js"), "pristine\n").unwrap();

        copy_dir_over(&src, &dst).unwrap();
        assert_eq!(
            fs::read_to_string(dst.join("index.js")).unwrap(),
            "edited\n"
        );
        assert!(!dst.join("node_modules").exists());
        fs::remove_dir_all(&src).ok();
        fs::remove_dir_all(&dst).ok();
    }

    #[test]
    fn diff_dirs_reports_changes_and_empty_when_identical() {
        let a = tmp("diff-a");
        let b = tmp("diff-b");
        fs::write(a.join("f.js"), "one\n").unwrap();
        fs::write(b.join("f.js"), "one\ntwo\n").unwrap();
        let diff = diff_dirs(&a, &b).unwrap();
        assert!(diff.contains("+two"));

        let c = tmp("diff-c");
        let d = tmp("diff-d");
        fs::write(c.join("f.js"), "same\n").unwrap();
        fs::write(d.join("f.js"), "same\n").unwrap();
        assert!(diff_dirs(&c, &d).unwrap().trim().is_empty());
        for p in [a, b, c, d] {
            fs::remove_dir_all(&p).ok();
        }
    }

    #[test]
    fn patched_map_reads_pnpm_workspace_yaml() {
        let dir = tmp("ws-patched");
        fs::write(dir.join("package.json"), r#"{"name":"x"}"#).unwrap();
        fs::write(
            dir.join("pnpm-workspace.yaml"),
            "packages:\n  - \"packages/*\"\npatchedDependencies:\n  is-odd@3.0.1: patches/is-odd@3.0.1.patch\n  \"@scope/pkg@1.0.0\": patches/scope.patch\noverrides:\n  foo: 1.0.0\n",
        )
        .unwrap();
        let map = patched_map(dir.to_str().unwrap());
        assert_eq!(
            map.get("is-odd@3.0.1").map(String::as_str),
            Some("patches/is-odd@3.0.1.patch")
        );
        assert_eq!(
            map.get("@scope/pkg@1.0.0").map(String::as_str),
            Some("patches/scope.patch")
        );
        // `overrides:` is a sibling block, not part of patchedDependencies.
        assert!(!map.contains_key("foo"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn patched_map_merges_package_json_and_workspace() {
        let dir = tmp("merge-patched");
        fs::write(
            dir.join("package.json"),
            r#"{"pnpm":{"patchedDependencies":{"left-pad@1.3.0":"patches/left-pad.patch"}}}"#,
        )
        .unwrap();
        fs::write(
            dir.join("pnpm-workspace.yaml"),
            "patchedDependencies:\n  is-odd@3.0.1: patches/is-odd.patch\n",
        )
        .unwrap();
        let map = patched_map(dir.to_str().unwrap());
        assert!(map.contains_key("left-pad@1.3.0"));
        assert!(map.contains_key("is-odd@3.0.1"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn is_pnpm_repo_detects_lockfile() {
        let dir = tmp("pnpm-detect");
        assert!(!is_pnpm_repo(dir.to_str().unwrap()));
        fs::write(dir.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n").unwrap();
        assert!(is_pnpm_repo(dir.to_str().unwrap()));
        fs::remove_dir_all(&dir).ok();
    }
}
