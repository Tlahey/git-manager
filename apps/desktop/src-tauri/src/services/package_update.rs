//! Runs the update the user asked for, through the repo's own package manager.
//!
//! Same reasoning as `package_outdated.rs`: `pnpm`/`npm` own dependency resolution,
//! so we drive them rather than rewriting manifests ourselves. That matters more
//! here than for a read — pnpm knows that a `catalog:` dependency's version lives
//! in `pnpm-workspace.yaml` and rewrites *that* (verified: `pnpm update --latest -r`
//! turns `catalog: { is-odd: ^3.0.0 }` into `^3.0.1` and leaves the package's
//! manifest reading `catalog:`). Editing `package.json` by hand would silently do
//! nothing for the majority of this repo's dependencies.
//!
//! This is the one mutating command in the health tool: it changes manifests, the
//! lockfile and `node_modules`. It only ever runs from an explicit click.

use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOutcome {
    /// Names passed to the manager, echoed back so the UI can revalidate them.
    pub updated: Vec<String>,
    /// Combined stdout/stderr, shown verbatim — the manager's own report is more
    /// informative than anything we could summarise from it.
    pub output: String,
}

/// Builds the argument list, or `None` for a manager we don't drive.
///
/// `-r` so a workspace repo updates every package that declares the dependency,
/// not just the root; `--latest` opts out of the declared range for a major bump.
fn update_args<'a>(
    package_manager: &str,
    names: &'a [String],
    to_latest: bool,
) -> Option<Vec<&'a str>> {
    let mut args = match package_manager {
        "pnpm" => vec!["update", "-r"],
        "npm" => vec!["update"],
        _ => return None,
    };
    if to_latest {
        args.push("--latest");
    }
    args.extend(names.iter().map(String::as_str));
    Some(args)
}

/// Updates `names` in `repo_path`. With `to_latest`, crosses version ranges
/// (and therefore majors); without, moves only within what the manifests allow.
pub fn update_packages(
    repo_path: &str,
    package_manager: &str,
    names: Vec<String>,
    to_latest: bool,
) -> Result<UpdateOutcome, String> {
    if names.is_empty() {
        return Err("No packages selected to update".to_string());
    }
    // An empty name would make the manager update *everything*, which is not what
    // any button in the UI offers.
    if names.iter().any(|name| name.trim().is_empty()) {
        return Err("Cannot update a package with an empty name".to_string());
    }
    let Some(args) = update_args(package_manager, &names, to_latest) else {
        return Err(format!("Updating is not supported for {package_manager}"));
    };

    let output = match Command::new(package_manager)
        .current_dir(repo_path)
        .args(&args)
        .output()
    {
        Ok(output) => output,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(format!("{package_manager} is not installed"));
        }
        Err(error) => return Err(format!("Failed to run {package_manager} update: {error}")),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() {
        return Err(format!("{package_manager} update failed: {stdout}{stderr}"));
    }

    Ok(UpdateOutcome {
        updated: names,
        output: format!("{stdout}{stderr}").trim().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn pnpm_updates_across_the_whole_workspace() {
        let list = names(&["react"]);
        assert_eq!(
            update_args("pnpm", &list, false),
            Some(vec!["update", "-r", "react"])
        );
    }

    #[test]
    fn latest_opts_out_of_the_declared_range() {
        let list = names(&["react", "vite"]);
        assert_eq!(
            update_args("pnpm", &list, true),
            Some(vec!["update", "-r", "--latest", "react", "vite"])
        );
    }

    #[test]
    fn npm_has_no_recursive_flag() {
        let list = names(&["react"]);
        assert_eq!(
            update_args("npm", &list, false),
            Some(vec!["update", "react"])
        );
    }

    #[test]
    fn managers_we_do_not_drive_have_no_arguments() {
        let list = names(&["react"]);
        for manager in ["yarn", "bun", "unknown"] {
            assert_eq!(update_args(manager, &list, false), None);
        }
    }

    #[test]
    fn refuses_an_empty_selection_rather_than_updating_everything() {
        let error = update_packages("/tmp", "pnpm", Vec::new(), false).unwrap_err();
        assert!(error.contains("No packages selected"));
    }

    #[test]
    fn refuses_a_blank_name_which_would_widen_to_every_dependency() {
        let error = update_packages("/tmp", "pnpm", names(&["  "]), false).unwrap_err();
        assert!(error.contains("empty name"));
    }

    #[test]
    fn refuses_a_manager_it_cannot_drive_before_spawning_anything() {
        let error = update_packages("/tmp", "yarn", names(&["react"]), false).unwrap_err();
        assert!(error.contains("not supported"));
    }
}
