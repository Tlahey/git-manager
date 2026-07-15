//! Detects a repository's GitHub pull-request template(s) so the PR composer can pre-fill the
//! description exactly like github.com does. Pure filesystem — no network, no git2 — mirroring
//! `ai_convention.rs`: it only *locates and reads* the template text; deciding what to do with it
//! (show it, ask the model to fill it in) lives in the frontend / `@git-manager/ai`.
//!
//! Resolution follows GitHub's own rules: a template may live in the repo root, `.github/`, or
//! `docs/`; a single file is `PULL_REQUEST_TEMPLATE.md` (any case, `.md`/`.txt`/no extension), and
//! multiple templates live in a `PULL_REQUEST_TEMPLATE/` sub-directory of any of those three roots.
//! A single top-level template takes precedence over a multi-template directory.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

/// Result of scanning a repo for PR templates. Serde-tagged so the TS side is a discriminated union.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PrTemplateDetection {
    /// No template configured.
    None,
    /// A single template file. `source` is its repo-relative path (for display).
    Single { source: String, content: String },
    /// A `PULL_REQUEST_TEMPLATE/` directory with one entry per `.md` file.
    Multiple { options: Vec<PrTemplateOption> },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PrTemplateOption {
    /// The file name (e.g. `bug.md`) — this is what GitHub's `?template=` query param expects.
    pub name: String,
    pub content: String,
}

const MAX_TEMPLATE_CHARS: usize = 16_000;

/// Roots GitHub searches, in precedence order.
const TEMPLATE_ROOTS: &[&str] = &[".github", "", "docs"];

fn truncate(text: &str) -> String {
    let trimmed = text.trim_end();
    if trimmed.len() <= MAX_TEMPLATE_CHARS {
        trimmed.to_string()
    } else {
        format!(
            "{}\n\n[template truncated, showing first {} chars]",
            &trimmed[..MAX_TEMPLATE_CHARS],
            MAX_TEMPLATE_CHARS
        )
    }
}

/// True if `name` is a single PR-template file name (case-insensitive, `.md`/`.txt`/no extension).
fn is_single_template_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "pull_request_template.md" | "pull_request_template.txt" | "pull_request_template"
    )
}

/// The path relative to `root_dir`, for a human-readable `source` (e.g. `.github/PULL_REQUEST_TEMPLATE.md`).
fn display_path(repo_root: &Path, file: &Path) -> String {
    file.strip_prefix(repo_root)
        .unwrap_or(file)
        .to_string_lossy()
        .replace('\\', "/")
}

fn find_single_template(repo_root: &Path) -> Option<PrTemplateDetection> {
    for sub in TEMPLATE_ROOTS {
        let dir = if sub.is_empty() {
            repo_root.to_path_buf()
        } else {
            repo_root.join(sub)
        };
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        // Collect then sort so the pick is deterministic regardless of readdir order.
        let mut matches: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && p.file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(is_single_template_name)
            })
            .collect();
        matches.sort();
        for path in matches {
            if let Ok(content) = fs::read_to_string(&path) {
                if !content.trim().is_empty() {
                    return Some(PrTemplateDetection::Single {
                        source: display_path(repo_root, &path),
                        content: truncate(&content),
                    });
                }
            }
        }
    }
    None
}

fn find_multiple_templates(repo_root: &Path) -> Option<PrTemplateDetection> {
    for sub in TEMPLATE_ROOTS {
        let base = if sub.is_empty() {
            repo_root.to_path_buf()
        } else {
            repo_root.join(sub)
        };
        // The directory name is case-insensitive on GitHub; match it as such.
        let Ok(base_entries) = fs::read_dir(&base) else {
            continue;
        };
        let template_dir = base_entries.flatten().map(|e| e.path()).find(|p| {
            p.is_dir()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.eq_ignore_ascii_case("PULL_REQUEST_TEMPLATE"))
        });
        let Some(template_dir) = template_dir else {
            continue;
        };

        let Ok(entries) = fs::read_dir(&template_dir) else {
            continue;
        };
        let mut md_files: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && p.extension()
                        .and_then(|e| e.to_str())
                        .is_some_and(|e| e.eq_ignore_ascii_case("md"))
            })
            .collect();
        md_files.sort();

        let options: Vec<PrTemplateOption> = md_files
            .iter()
            .filter_map(|path| {
                let content = fs::read_to_string(path).ok()?;
                if content.trim().is_empty() {
                    return None;
                }
                let name = path.file_name()?.to_str()?.to_string();
                Some(PrTemplateOption {
                    name,
                    content: truncate(&content),
                })
            })
            .collect();

        if !options.is_empty() {
            return Some(PrTemplateDetection::Multiple { options });
        }
    }
    None
}

/// Scan a repo for a GitHub PR template. A single top-level file wins over a template directory.
pub fn detect_pr_template(repo_path: &str) -> PrTemplateDetection {
    let root = Path::new(repo_path);
    find_single_template(root)
        .or_else(|| find_multiple_templates(root))
        .unwrap_or(PrTemplateDetection::None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_repo(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "gm-test-prtmpl-{}-{}-{}",
            name,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        // Start clean in case a previous run left the dir behind.
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(root: &Path, rel: &str, content: &str) {
        let path = root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    #[test]
    fn returns_none_when_no_template_exists() {
        let dir = temp_repo("none");
        assert_eq!(
            detect_pr_template(dir.to_str().unwrap()),
            PrTemplateDetection::None
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_a_single_github_template() {
        let dir = temp_repo("single");
        write(&dir, ".github/PULL_REQUEST_TEMPLATE.md", "## Summary\n");
        match detect_pr_template(dir.to_str().unwrap()) {
            PrTemplateDetection::Single { source, content } => {
                assert_eq!(source, ".github/PULL_REQUEST_TEMPLATE.md");
                assert_eq!(content, "## Summary");
            }
            other => panic!("expected Single, got {other:?}"),
        }
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_a_root_lowercase_template() {
        let dir = temp_repo("root-lower");
        write(&dir, "pull_request_template.md", "body");
        match detect_pr_template(dir.to_str().unwrap()) {
            PrTemplateDetection::Single { source, .. } => {
                assert_eq!(source, "pull_request_template.md")
            }
            other => panic!("expected Single, got {other:?}"),
        }
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_single_file_wins_over_a_template_directory() {
        let dir = temp_repo("single-wins");
        write(&dir, ".github/PULL_REQUEST_TEMPLATE.md", "single");
        write(&dir, ".github/PULL_REQUEST_TEMPLATE/bug.md", "bug");
        assert!(matches!(
            detect_pr_template(dir.to_str().unwrap()),
            PrTemplateDetection::Single { .. }
        ));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn detects_multiple_templates_sorted_by_name() {
        let dir = temp_repo("multiple");
        write(&dir, ".github/PULL_REQUEST_TEMPLATE/feature.md", "feat");
        write(&dir, ".github/PULL_REQUEST_TEMPLATE/bug.md", "bug");
        write(&dir, ".github/PULL_REQUEST_TEMPLATE/readme.txt", "ignored");
        match detect_pr_template(dir.to_str().unwrap()) {
            PrTemplateDetection::Multiple { options } => {
                let names: Vec<_> = options.iter().map(|o| o.name.as_str()).collect();
                assert_eq!(names, vec!["bug.md", "feature.md"]);
            }
            other => panic!("expected Multiple, got {other:?}"),
        }
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn ignores_an_empty_template_file() {
        let dir = temp_repo("empty");
        write(&dir, ".github/PULL_REQUEST_TEMPLATE.md", "   \n");
        assert_eq!(
            detect_pr_template(dir.to_str().unwrap()),
            PrTemplateDetection::None
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn prefers_dot_github_over_docs_for_a_single_template() {
        let dir = temp_repo("precedence");
        write(&dir, "docs/PULL_REQUEST_TEMPLATE.md", "docs one");
        write(&dir, ".github/PULL_REQUEST_TEMPLATE.md", "github one");
        match detect_pr_template(dir.to_str().unwrap()) {
            PrTemplateDetection::Single { source, content } => {
                assert_eq!(source, ".github/PULL_REQUEST_TEMPLATE.md");
                assert_eq!(content, "github one");
            }
            other => panic!("expected Single, got {other:?}"),
        }
        fs::remove_dir_all(&dir).ok();
    }
}
