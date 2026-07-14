//! Discovers a repository's own commit-message convention so AI features can honor it. This is
//! filesystem/git config only (git logic belongs in Rust) — it does NOT run commitlint (target
//! repos rarely have it installed, and shelling out to `npx` against an arbitrary repo is fragile).
//! It just locates the relevant config and returns its text; interpreting/validating it against
//! that text lives in `@git-manager/ai` (the AI brain), and the model is asked to follow it.

use git2::Repository;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitConvention {
    /// Where the convention came from, e.g. "commitlint.config.js" or "package.json".
    pub source: String,
    /// The raw config text (truncated), for the model to read and conform to.
    pub content: String,
}

const MAX_CONTENT_CHARS: usize = 2000;

/// commitlint config files, in the resolution order commitlint itself roughly uses.
const COMMITLINT_FILES: &[&str] = &[
    "commitlint.config.ts",
    "commitlint.config.mjs",
    "commitlint.config.cjs",
    "commitlint.config.js",
    ".commitlintrc.ts",
    ".commitlintrc.cjs",
    ".commitlintrc.js",
    ".commitlintrc.yaml",
    ".commitlintrc.yml",
    ".commitlintrc.json",
    ".commitlintrc",
];

fn truncate(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.len() <= MAX_CONTENT_CHARS {
        trimmed.to_string()
    } else {
        format!(
            "{}\n\n[config truncated, showing first {} chars]",
            &trimmed[..MAX_CONTENT_CHARS],
            MAX_CONTENT_CHARS
        )
    }
}

/// Returns the project's commit convention if one is configured. Resolution order: a dedicated
/// commitlint config file, then a `commitlint` key in `package.json`, then a git `commit.template`.
pub fn detect_commit_convention(repo_path: &str, repo: &Repository) -> Option<CommitConvention> {
    let root = Path::new(repo_path);

    for name in COMMITLINT_FILES {
        let path = root.join(name);
        if let Ok(content) = fs::read_to_string(&path) {
            if !content.trim().is_empty() {
                return Some(CommitConvention {
                    source: (*name).to_string(),
                    content: truncate(&content),
                });
            }
        }
    }

    if let Some(convention) = commitlint_from_package_json(root) {
        return Some(convention);
    }

    commit_template(repo_path, repo)
}

/// Extracts a top-level `commitlint` key from `package.json`, if present.
fn commitlint_from_package_json(root: &Path) -> Option<CommitConvention> {
    let raw = fs::read_to_string(root.join("package.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let commitlint = json.get("commitlint")?;
    Some(CommitConvention {
        source: "package.json".to_string(),
        content: truncate(&serde_json::to_string_pretty(commitlint).ok()?),
    })
}

/// Reads the file referenced by git's `commit.template` config, if set and readable.
fn commit_template(repo_path: &str, repo: &Repository) -> Option<CommitConvention> {
    let config = repo.config().ok()?;
    let template = config.get_string("commit.template").ok()?;
    if template.trim().is_empty() {
        return None;
    }

    // The template path may be absolute, ~-relative, or repo-relative — resolve the repo-relative
    // and absolute cases (the common ones); a bare ~ is left as-is for the caller's shell to expand.
    let path = Path::new(&template);
    let resolved = if path.is_absolute() {
        path.to_path_buf()
    } else {
        Path::new(repo_path).join(path)
    };

    let content = fs::read_to_string(resolved).ok()?;
    if content.trim().is_empty() {
        return None;
    }
    Some(CommitConvention {
        source: format!("commit.template ({})", template),
        content: truncate(&content),
    })
}
