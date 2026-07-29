//! Minimal readers for the top-level blocks of `pnpm-workspace.yaml`.
//!
//! Three of that file's blocks matter to this app — the workspace globs
//! (`packages:`), the shared version catalog (`catalog:`) and patched dependencies
//! (`patchedDependencies:`) — and all three are flat: a single indented level under
//! an unindented key. Reading them by hand keeps a YAML crate out of the dependency
//! tree. Anything nested deeper than one level is deliberately out of scope; a
//! caller that needs real YAML should pull in a parser rather than extend this.

use std::collections::BTreeMap;
use std::path::Path;

/// The lines of a top-level `<block>:` block, trimmed, with comments and blank
/// lines dropped. The block ends at the first line that isn't indented.
fn block_lines(repo_path: &Path, block: &str) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(repo_path.join("pnpm-workspace.yaml")) else {
        return Vec::new();
    };
    let opener = format!("{block}:");

    let mut lines = Vec::new();
    let mut in_block = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if !in_block {
            // Only an unindented `<block>:` opens it, so a nested key of the same
            // name inside another block doesn't.
            if line.starts_with(&opener) {
                in_block = true;
            }
            continue;
        }
        if !line.starts_with([' ', '\t']) {
            break;
        }
        lines.push(trimmed.to_string());
    }
    lines
}

fn unquote(value: &str) -> String {
    value.trim().trim_matches(['"', '\'']).to_string()
}

/// Flat `key: value` entries of a top-level block (`catalog:`, `patchedDependencies:`).
pub fn block_map(repo_path: &Path, block: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for line in block_lines(repo_path, block) {
        // Split on the first `:` — a quoted key like `"@scope/pkg@1.0.0"` has none
        // of its own, and a value that does (a URL) keeps everything after it.
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = unquote(key);
        if !key.is_empty() {
            map.insert(key, unquote(value));
        }
    }
    map
}

/// Entries of a top-level sequence block (`packages:` — one `- "glob"` per line).
pub fn block_list(repo_path: &Path, block: &str) -> Vec<String> {
    block_lines(repo_path, block)
        .iter()
        .filter_map(|line| line.strip_prefix('-'))
        .map(unquote)
        .filter(|entry| !entry.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("gm-pnpmws-{}-{}", name, std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    const SAMPLE: &str = r#"packages:
  - "apps/*"
  - "packages/*"

# a comment
catalog:
  typescript: ^7.0.2
  "@types/react": ^18.3.12
  # pinned on purpose
  "@storybook/addon-a11y": 10.4.6

patchedDependencies:
  is-odd@3.0.1: patches/is-odd@3.0.1.patch
"#;

    #[test]
    fn block_list_reads_a_sequence_block() {
        let dir = tmp("list");
        fs::write(dir.join("pnpm-workspace.yaml"), SAMPLE).unwrap();
        assert_eq!(block_list(&dir, "packages"), vec!["apps/*", "packages/*"]);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn block_map_reads_a_map_block_and_stops_at_the_next_one() {
        let dir = tmp("map");
        fs::write(dir.join("pnpm-workspace.yaml"), SAMPLE).unwrap();
        let catalog = block_map(&dir, "catalog");
        assert_eq!(
            catalog.get("typescript").map(String::as_str),
            Some("^7.0.2")
        );
        assert_eq!(
            catalog.get("@types/react").map(String::as_str),
            Some("^18.3.12")
        );
        assert_eq!(
            catalog.get("@storybook/addon-a11y").map(String::as_str),
            Some("10.4.6")
        );
        // `patchedDependencies:` is a sibling block, not part of the catalog.
        assert!(!catalog.contains_key("is-odd@3.0.1"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn block_map_keeps_colons_inside_a_value() {
        let dir = tmp("colon");
        fs::write(
            dir.join("pnpm-workspace.yaml"),
            "catalog:\n  foo: npm:bar@^1.0.0\n",
        )
        .unwrap();
        assert_eq!(
            block_map(&dir, "catalog").get("foo").map(String::as_str),
            Some("npm:bar@^1.0.0")
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_file_yields_empty_blocks() {
        let dir = tmp("absent");
        assert!(block_list(&dir, "packages").is_empty());
        assert!(block_map(&dir, "catalog").is_empty());
        fs::remove_dir_all(&dir).ok();
    }
}
