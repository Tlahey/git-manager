//! What this repo actually uses from a dependency.
//!
//! The half that makes an upgrade-risk judgement worth making. A changelog alone
//! only supports "here is what changed", which the user can read themselves; the
//! useful question is which of those changes touch code they wrote, and that needs
//! the *usage surface*: which entry points are imported, which named exports are
//! pulled off them, and from how many files.
//!
//! Deliberately a scan of import statements, not a type-aware analysis. Import
//! sites are cheap to find, stable across TS/JS dialects, and bound the payload to
//! something a prompt can hold. The tradeoff is real and the feature says so: a
//! breaking change that never shows up at an import site — runtime behaviour, peer
//! requirements, bundler or CSS changes — is invisible here.

use serde::Serialize;
use std::collections::BTreeSet;
use std::path::Path;

/// Directories never worth walking: dependencies, build output, VCS internals.
const SKIP_DIRS: [&str; 10] = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    "coverage",
    ".next",
    ".turbo",
    "storybook-static",
    ".cache",
];

const SOURCE_EXTENSIONS: [&str; 8] = ["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"];

/// Caps on what travels to the model. Enough to ground a judgement, small enough
/// that a large repo cannot blow the context window on one dependency.
const MAX_FILES: usize = 40;
const MAX_SAMPLES: usize = 12;
const MAX_SYMBOLS: usize = 60;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UsageSample {
    pub path: String,
    /// 1-indexed.
    pub line: u32,
    /// The import statement, collapsed onto one line.
    pub text: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PackageUsage {
    pub name: String,
    /// How many source files import it — the blast radius, before any capping.
    pub file_count: usize,
    /// Importing files, repo-relative, capped at `MAX_FILES`.
    pub files: Vec<String>,
    /// Named exports pulled from it anywhere in the repo.
    pub symbols: Vec<String>,
    /// Subpath entry points in use (`react-dom/client`). Their own API surface, and
    /// often the thing a major release moves.
    pub subpaths: Vec<String>,
    /// Some file does `import X from 'pkg'`.
    pub default_import: bool,
    /// Some file does `import * as X from 'pkg'` — the whole surface is reachable,
    /// so the named-symbol list understates what could break.
    pub namespace_import: bool,
    /// Verbatim import statements, for the model to ground on rather than infer.
    pub samples: Vec<UsageSample>,
}

/// The specifier a `from '…'` / `require('…')` refers to, when it is this package.
/// Returns the subpath (`""` for a bare import) so `react-dom/client` is kept apart.
fn match_specifier<'a>(specifier: &'a str, package: &str) -> Option<&'a str> {
    if specifier == package {
        return Some("");
    }
    specifier
        .strip_prefix(package)
        .filter(|rest| rest.starts_with('/'))
}

/// Named bindings and import kinds out of an import clause.
///
/// Handles `React, { useState, useEffect as fx }`, `* as ns`, and type-only
/// imports. `as` aliases keep the *imported* name — the alias is a local detail,
/// the export name is what a changelog talks about.
fn parse_clause(clause: &str, usage: &mut PackageUsage) {
    let clause = clause.trim().trim_start_matches("type ").trim();

    let (braced, unbraced) = match (clause.find('{'), clause.rfind('}')) {
        (Some(open), Some(close)) if close > open => (
            Some(&clause[open + 1..close]),
            format!("{}{}", &clause[..open], &clause[close + 1..]),
        ),
        _ => (None, clause.to_string()),
    };

    if let Some(inner) = braced {
        for part in inner.split(',') {
            let name = part
                .trim()
                .trim_start_matches("type ")
                .split_whitespace()
                .next()
                .unwrap_or_default()
                .trim();
            if !name.is_empty() {
                usage.symbols.push(name.to_string());
            }
        }
    }

    let rest = unbraced.trim().trim_end_matches(',').trim();
    if rest.contains('*') {
        usage.namespace_import = true;
    } else if !rest.is_empty() {
        usage.default_import = true;
    }
}

/// Every `from '<spec>'` / `require('<spec>')` / `import('<spec>')` in one file.
///
/// Walks back from the specifier to the statement that owns it rather than
/// matching a line, because a real import clause is routinely spread over a dozen
/// lines and a line-wise regex would see only the closing brace.
fn scan_file(text: &str, package: &str, path: &str, usage: &mut PackageUsage) -> bool {
    let bytes = text.as_bytes();
    let mut found = false;

    for (index, _) in text.match_indices(['\'', '"']) {
        let quote = bytes[index] as char;
        let Some(end_offset) = text[index + 1..].find(quote) else {
            continue;
        };
        let specifier = &text[index + 1..index + 1 + end_offset];
        let Some(subpath) = match_specifier(specifier, package) else {
            continue;
        };

        // What introduces the specifier decides whether this is an import at all —
        // a bare string equal to the package name in some other position is not.
        let before = text[..index].trim_end();
        let statement_start = match () {
            _ if before.ends_with("from") => before.len() - "from".len(),
            _ if before.ends_with("require(") => before.len() - "require(".len(),
            _ if before.ends_with("import(") => before.len() - "import(".len(),
            // `import 'pkg'` — a side-effect import, no bindings.
            _ if before.ends_with("import") => before.len() - "import".len(),
            _ => continue,
        };

        found = true;
        if !subpath.is_empty() {
            usage.subpaths.push(format!("{package}{subpath}"));
        }

        // The clause lives between the owning `import` keyword and `from`.
        let head = &text[..statement_start];
        if let Some(keyword) = head.rfind("import") {
            parse_clause(&text[keyword + "import".len()..statement_start], usage);
        }

        if usage.samples.len() < MAX_SAMPLES {
            let line_start = head.rfind('\n').map(|n| n + 1).unwrap_or(0);
            let statement = text[line_start..index + 1 + end_offset + 1]
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            usage.samples.push(UsageSample {
                path: path.to_string(),
                line: (text[..line_start].matches('\n').count() + 1) as u32,
                text: statement,
            });
        }
    }

    found
}

fn is_source_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SOURCE_EXTENSIONS.contains(&e))
        .unwrap_or(false)
}

fn walk(dir: &Path, root: &Path, package: &str, usage: &mut PackageUsage, files: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();

        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_ref()) || name.starts_with('.') {
                continue;
            }
            walk(&path, root, package, usage, files);
            continue;
        }
        if !is_source_file(&path) {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        // Cheap pre-filter: the vast majority of files never name the package.
        if !text.contains(package) {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        if scan_file(&text, package, &relative, usage) {
            files.push(relative);
        }
    }
}

fn dedupe(values: Vec<String>, cap: usize) -> Vec<String> {
    let set: BTreeSet<String> = values.into_iter().collect();
    set.into_iter().take(cap).collect()
}

/// Scans `repo_path` for everything it imports from `package`.
pub fn scan_usage(repo_path: &str, package: &str) -> Result<PackageUsage, String> {
    if package.trim().is_empty() {
        return Err("Cannot scan usage for an empty package name".to_string());
    }
    let root = Path::new(repo_path);
    if !root.is_dir() {
        return Err(format!("{repo_path} is not a directory"));
    }

    let mut usage = PackageUsage {
        name: package.to_string(),
        ..Default::default()
    };
    let mut files = Vec::new();
    walk(root, root, package, &mut usage, &mut files);

    files.sort();
    usage.file_count = files.len();
    files.truncate(MAX_FILES);
    usage.files = files;
    usage.symbols = dedupe(std::mem::take(&mut usage.symbols), MAX_SYMBOLS);
    usage.subpaths = dedupe(std::mem::take(&mut usage.subpaths), MAX_SYMBOLS);
    Ok(usage)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("gm-usage-{}-{}", name, std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(dir: &Path, relative: &str, contents: &str) {
        let path = dir.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    fn scan(dir: &Path, package: &str) -> PackageUsage {
        scan_usage(dir.to_str().unwrap(), package).unwrap()
    }

    #[test]
    fn collects_named_symbols_across_files() {
        let dir = tmp("named");
        write(
            &dir,
            "src/a.ts",
            "import { useState, useEffect } from 'react'\n",
        );
        write(
            &dir,
            "src/b.tsx",
            "import { useState, useMemo } from 'react'\n",
        );
        let usage = scan(&dir, "react");

        assert_eq!(usage.file_count, 2);
        assert_eq!(usage.symbols, vec!["useEffect", "useMemo", "useState"]);
        assert_eq!(usage.files, vec!["src/a.ts", "src/b.tsx"]);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn keeps_the_exported_name_not_the_local_alias() {
        let dir = tmp("alias");
        write(&dir, "a.ts", "import { useEffect as fx } from 'react'\n");
        let usage = scan(&dir, "react");
        assert_eq!(usage.symbols, vec!["useEffect"]);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reads_a_clause_spread_over_several_lines() {
        let dir = tmp("multiline");
        write(
            &dir,
            "a.ts",
            "import {\n  useState,\n  useEffect,\n} from 'react'\n",
        );
        let usage = scan(&dir, "react");
        assert_eq!(usage.symbols, vec!["useEffect", "useState"]);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn tells_default_and_namespace_imports_apart() {
        let dir = tmp("kinds");
        write(&dir, "a.ts", "import React from 'react'\n");
        let default_only = scan(&dir, "react");
        assert!(default_only.default_import);
        assert!(!default_only.namespace_import);

        write(&dir, "b.ts", "import * as React2 from 'react'\n");
        let both = scan(&dir, "react");
        assert!(both.namespace_import);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn records_a_default_import_alongside_its_named_ones() {
        let dir = tmp("mixed");
        write(&dir, "a.ts", "import React, { useState } from 'react'\n");
        let usage = scan(&dir, "react");
        assert!(usage.default_import);
        assert_eq!(usage.symbols, vec!["useState"]);
        fs::remove_dir_all(&dir).ok();
    }

    /** A major release moving an entry point is exactly the react-dom/client story. */
    #[test]
    fn separates_subpath_entry_points_from_the_bare_package() {
        let dir = tmp("subpath");
        write(
            &dir,
            "a.ts",
            "import { createRoot } from 'react-dom/client'\n",
        );
        write(&dir, "b.ts", "import ReactDOM from 'react-dom'\n");
        let usage = scan(&dir, "react-dom");

        assert_eq!(usage.subpaths, vec!["react-dom/client"]);
        assert_eq!(usage.symbols, vec!["createRoot"]);
        assert!(usage.default_import);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn does_not_match_a_package_whose_name_is_a_prefix_of_another() {
        let dir = tmp("prefix");
        write(&dir, "a.ts", "import x from 'react-dom'\n");
        let usage = scan(&dir, "react");
        assert_eq!(usage.file_count, 0);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn finds_require_and_dynamic_imports() {
        let dir = tmp("require");
        write(&dir, "a.js", "const lodash = require('lodash')\n");
        write(&dir, "b.ts", "const mod = await import('lodash')\n");
        let usage = scan(&dir, "lodash");
        assert_eq!(usage.file_count, 2);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn counts_a_side_effect_import_with_no_bindings() {
        let dir = tmp("side-effect");
        write(&dir, "a.ts", "import 'zone.js'\n");
        let usage = scan(&dir, "zone.js");
        assert_eq!(usage.file_count, 1);
        assert!(usage.symbols.is_empty());
        assert!(!usage.default_import);
        fs::remove_dir_all(&dir).ok();
    }

    /** A string that merely equals the package name is not an import of it. */
    #[test]
    fn ignores_the_package_name_outside_an_import() {
        let dir = tmp("bare-string");
        write(
            &dir,
            "a.ts",
            "const label = 'react'\nconsole.log('react')\n",
        );
        let usage = scan(&dir, "react");
        assert_eq!(usage.file_count, 0);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn skips_dependencies_and_build_output() {
        let dir = tmp("skip");
        write(&dir, "node_modules/x/index.js", "import 'react'\n");
        write(&dir, "dist/bundle.js", "import 'react'\n");
        write(&dir, "src/a.ts", "import 'react'\n");
        let usage = scan(&dir, "react");
        assert_eq!(usage.files, vec!["src/a.ts"]);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn captures_a_verbatim_sample_with_its_line() {
        let dir = tmp("sample");
        write(
            &dir,
            "a.ts",
            "// header\nimport { useState } from 'react'\n",
        );
        let usage = scan(&dir, "react");

        assert_eq!(usage.samples.len(), 1);
        assert_eq!(usage.samples[0].path, "a.ts");
        assert_eq!(usage.samples[0].line, 2);
        assert_eq!(usage.samples[0].text, "import { useState } from 'react'");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reports_the_true_file_count_even_when_the_list_is_capped() {
        let dir = tmp("cap");
        for i in 0..(MAX_FILES + 5) {
            write(&dir, &format!("src/f{i}.ts"), "import 'react'\n");
        }
        let usage = scan(&dir, "react");
        assert_eq!(usage.file_count, MAX_FILES + 5);
        assert_eq!(usage.files.len(), MAX_FILES);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rejects_an_empty_package_name() {
        let dir = tmp("empty");
        assert!(scan_usage(dir.to_str().unwrap(), "  ").is_err());
        fs::remove_dir_all(&dir).ok();
    }
}
