//! Release notes for a dependency the user is about to update.
//!
//! Two halves with very different costs. Working out *where* a package lives is
//! free and offline — the published `package.json` in `node_modules` carries its
//! own `repository` field. Reading the notes is not: they live on GitHub, so that
//! half is a network call, made only when the user opens a changelog.
//!
//! Matching releases to versions is necessarily fuzzy. A tag may be `v10.4.6`,
//! `10.4.6`, or `@scope/pkg@10.4.6` depending on how the project releases, and a
//! monorepo tags every package together. We extract a version from the tag, drop
//! tags that clearly belong to a *different* package, and keep what lands in
//! `(from, to]`. When nothing matches we say so and hand back the releases URL
//! rather than pretending the package has no history.

use crate::services::github_api;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChangelogRelease {
    pub tag: String,
    /// The release's title; often empty, in which case the UI falls back to the tag.
    pub name: String,
    /// ISO-8601, straight from the API.
    pub published_at: String,
    /// Markdown body of the release notes.
    pub body: String,
    pub url: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PackageChangelog {
    /// `owner/repo`, or `None` when the package declares no GitHub repository.
    pub repository: Option<String>,
    /// Where to read the full history, for the "open on GitHub" escape hatch.
    pub releases_url: Option<String>,
    /// Releases falling in `(from, to]`, newest first.
    pub releases: Vec<ChangelogRelease>,
    /// True when at least one release's tag matched the version range. False with a
    /// non-empty `releases` means we fell back to the most recent ones.
    pub matched: bool,
}

fn empty_changelog() -> PackageChangelog {
    PackageChangelog {
        repository: None,
        releases_url: None,
        releases: Vec::new(),
        matched: false,
    }
}

// ─── Repository resolution (offline) ──────────────────────────────────────────

/// Pulls `owner/repo` out of the many shapes npm's `repository` field takes:
/// a bare `owner/repo`, a `github:` shorthand, or any git/https GitHub URL.
fn parse_github_repo(raw: &str) -> Option<(String, String)> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }

    let path = if let Some(rest) = raw.strip_prefix("github:") {
        rest.to_string()
    } else if let Some(index) = raw.find("github.com") {
        // Covers https://, git+https://, git://, and git+ssh://git@ forms; the
        // separator after the host is `/` for URLs and `:` for scp-style remotes.
        raw[index + "github.com".len()..]
            .trim_start_matches([':', '/'])
            .to_string()
    } else if !raw.contains("://") && raw.matches('/').count() == 1 {
        raw.to_string()
    } else {
        return None;
    };

    // A `homepage` is typically a browsing URL, so drop any fragment or query
    // (`.../acme/thing#readme`) before reading the path segments.
    let path = path
        .split(['#', '?'])
        .next()
        .unwrap_or_default()
        .to_string();

    let mut segments = path.split('/');
    let owner = segments.next()?.trim();
    let repo = segments.next()?.trim().trim_end_matches(".git");
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner.to_string(), repo.to_string()))
}

fn read_manifest(path: &Path) -> Option<serde_json::Value> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn package_subpath(name: &str) -> PathBuf {
    let mut path = PathBuf::new();
    for segment in name.split('/') {
        path = path.join(segment);
    }
    path
}

/// An installed package's own manifest, wherever the layout put it.
///
/// The root `node_modules` comes first: npm and yarn hoist everything there, and
/// it is also where a root dependency lives under pnpm. But in a pnpm *workspace*
/// the root only holds the root manifest's dependencies — a package declared by
/// `packages/ui` isn't there at all. So we then look in pnpm's store, whose
/// `.pnpm/<pkg>@<version>/node_modules/<pkg>` layout holds every package in the
/// workspace no matter which member asked for it. Without that second lookup
/// almost nothing resolves here.
fn installed_manifest(repo_path: &str, name: &str) -> Option<serde_json::Value> {
    let node_modules = Path::new(repo_path).join("node_modules");
    let subpath = package_subpath(name);

    if let Some(manifest) = read_manifest(&node_modules.join(&subpath).join("package.json")) {
        return Some(manifest);
    }

    let pattern = node_modules
        .join(".pnpm/*/node_modules")
        .join(&subpath)
        .join("package.json");
    glob::glob(&pattern.to_string_lossy())
        .ok()?
        .flatten()
        .find_map(|path| read_manifest(&path))
}

/// The GitHub repo an installed package declares, read from its own manifest.
/// Falls back to `homepage` because some packages only set that.
pub fn resolve_repository(repo_path: &str, name: &str) -> Option<(String, String)> {
    let manifest = installed_manifest(repo_path, name)?;

    let repository = manifest.get("repository");
    let raw = match repository {
        Some(serde_json::Value::String(s)) => Some(s.clone()),
        Some(object) => object
            .get("url")
            .and_then(|u| u.as_str())
            .map(str::to_string),
        None => None,
    };

    raw.as_deref().and_then(parse_github_repo).or_else(|| {
        manifest
            .get("homepage")?
            .as_str()
            .and_then(parse_github_repo)
    })
}

// ─── Tag matching ─────────────────────────────────────────────────────────────

/// The numeric version a release tag refers to, and the package it names (if any).
///
/// Splits on the last `@` so `@scope/pkg@1.2.3` yields both parts while `v1.2.3`
/// yields only the version.
fn split_tag(tag: &str) -> (Option<&str>, &str) {
    match tag.rfind('@') {
        // A leading `@` is a scope, not a separator: `@scope/pkg` has no version.
        Some(index) if index > 0 => (Some(&tag[..index]), &tag[index + 1..]),
        _ => (None, tag),
    }
}

fn parse_version(version: &str) -> Option<(u64, u64, u64)> {
    let version = version.trim().trim_start_matches('v');
    let core = version.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

/// Whether `tag` names a release of `package` landing in `(from, to]`.
fn tag_is_in_range(tag: &str, package: &str, from: &str, to: &str) -> bool {
    let (tagged_package, version) = split_tag(tag);
    // A monorepo tags each package by name; anything naming a different one is
    // not this package's release. A tag with no name belongs to whatever released.
    if let Some(tagged) = tagged_package {
        if !tagged.is_empty() && tagged != package {
            return false;
        }
    }
    let (Some(version), Some(from), Some(to)) = (
        parse_version(version),
        parse_version(from),
        parse_version(to),
    ) else {
        return false;
    };
    version > from && version <= to
}

fn read_release(value: &serde_json::Value) -> Option<ChangelogRelease> {
    // A draft has no meaningful tag yet and a prerelease isn't what an update lands on.
    if value
        .get("draft")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
        || value
            .get("prerelease")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    {
        return None;
    }
    let field = |key: &str| {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };
    let tag = field("tag_name");
    if tag.is_empty() {
        return None;
    }
    Some(ChangelogRelease {
        name: field("name"),
        published_at: field("published_at"),
        body: field("body"),
        url: field("html_url"),
        tag,
    })
}

/// Keeps the releases covering `(from, to]`, or the most recent few when the tag
/// scheme defeats us — an unmatched list is still better than an empty panel.
fn select_releases(
    all: Vec<ChangelogRelease>,
    package: &str,
    from: &str,
    to: &str,
) -> (Vec<ChangelogRelease>, bool) {
    let matched: Vec<ChangelogRelease> = all
        .iter()
        .filter(|release| tag_is_in_range(&release.tag, package, from, to))
        .cloned()
        .collect();
    if !matched.is_empty() {
        return (matched, true);
    }
    (all.into_iter().take(5).collect(), false)
}

// ─── Fetch (network) ──────────────────────────────────────────────────────────

/// Release notes for `name` between the installed version and the target one.
///
/// `account_id` is optional and is never a secret itself — it is a GitHub login, resolved to the
/// actual token server-side via [`github_api::request`] (which in turn reads
/// `services/credential_store.rs` by account id, same as every other authenticated GitHub call the
/// app makes). Public repos work unauthenticated, just against a lower rate limit, which is why
/// `account_id` being absent is not an error. A repo we can't resolve, an account whose credential
/// went missing, or a request that fails for any other reason all yield the base (near-empty)
/// changelog rather than an error — the update itself doesn't depend on this, so nothing here should
/// ever block it.
///
/// Goes through `github_api::request` rather than its own `reqwest::Client` — this call targets
/// `https://api.github.com/…`, exactly the origin that module's URL allowlist already exists to
/// guard, so routing here is a straight fit with no need to widen that guard.
pub async fn fetch_changelog(
    repo_path: &str,
    name: &str,
    from: &str,
    to: &str,
    account_id: Option<String>,
) -> Result<PackageChangelog, String> {
    let Some((owner, repo)) = resolve_repository(repo_path, name) else {
        return Ok(empty_changelog());
    };
    let releases_url = format!("https://github.com/{owner}/{repo}/releases");

    let base = PackageChangelog {
        repository: Some(format!("{owner}/{repo}")),
        releases_url: Some(releases_url),
        ..empty_changelog()
    };

    let api_url = format!("https://api.github.com/repos/{owner}/{repo}/releases?per_page=100");
    let Ok(response) = github_api::request(
        account_id.as_deref(),
        &api_url,
        "GET",
        None,
        Some("application/vnd.github.v3+json"),
    )
    .await
    else {
        // Covers both a network failure and an account whose stored credential is missing —
        // `github_api::request` errors on the latter rather than silently downgrading to
        // anonymous, but a package's changelog isn't worth surfacing that as a hard error.
        return Ok(base);
    };
    if !response.ok {
        return Ok(base);
    }
    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&response.body) else {
        return Ok(base);
    };
    let Some(items) = payload.as_array() else {
        return Ok(base);
    };

    let all: Vec<ChangelogRelease> = items.iter().filter_map(read_release).collect();
    let (releases, matched) = select_releases(all, name, from, to);
    Ok(PackageChangelog {
        releases,
        matched,
        ..base
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn tmp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("gm-changelog-{}-{}", name, std::process::id()));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn parses_every_shape_the_repository_field_takes() {
        let expected = Some(("storybookjs".to_string(), "storybook".to_string()));
        for raw in [
            "storybookjs/storybook",
            "github:storybookjs/storybook",
            "https://github.com/storybookjs/storybook",
            "git+https://github.com/storybookjs/storybook.git",
            "git://github.com/storybookjs/storybook.git",
            "git+ssh://git@github.com/storybookjs/storybook.git",
        ] {
            assert_eq!(parse_github_repo(raw), expected, "raw {raw}");
        }
    }

    #[test]
    fn ignores_repositories_that_are_not_on_github() {
        assert_eq!(parse_github_repo("https://gitlab.com/owner/repo"), None);
        assert_eq!(parse_github_repo(""), None);
        assert_eq!(parse_github_repo("not a url"), None);
    }

    #[test]
    fn reads_the_repository_from_an_installed_package() {
        let dir = tmp("resolve");
        let pkg = dir.join("node_modules/@scope/thing");
        fs::create_dir_all(&pkg).unwrap();
        fs::write(
            pkg.join("package.json"),
            r#"{"version":"1.0.0","repository":{"type":"git",
                "url":"git+https://github.com/acme/thing.git","directory":"packages/thing"}}"#,
        )
        .unwrap();

        assert_eq!(
            resolve_repository(dir.to_str().unwrap(), "@scope/thing"),
            Some(("acme".to_string(), "thing".to_string()))
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn falls_back_to_homepage_when_there_is_no_repository_field() {
        let dir = tmp("homepage");
        let pkg = dir.join("node_modules/thing");
        fs::create_dir_all(&pkg).unwrap();
        fs::write(
            pkg.join("package.json"),
            r#"{"version":"1.0.0","homepage":"https://github.com/acme/thing#readme"}"#,
        )
        .unwrap();

        assert_eq!(
            resolve_repository(dir.to_str().unwrap(), "thing"),
            Some(("acme".to_string(), "thing".to_string()))
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_uninstalled_package_resolves_to_nothing() {
        let dir = tmp("absent");
        assert_eq!(resolve_repository(dir.to_str().unwrap(), "ghost"), None);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn matches_plain_and_prefixed_tags_within_the_range() {
        assert!(tag_is_in_range("v10.4.6", "storybook", "10.4.5", "10.4.6"));
        assert!(tag_is_in_range("10.4.6", "storybook", "10.4.5", "10.4.6"));
        assert!(tag_is_in_range(
            "@storybook/react@10.4.6",
            "@storybook/react",
            "10.4.5",
            "10.4.6"
        ));
    }

    #[test]
    fn excludes_the_version_already_installed_and_anything_past_the_target() {
        // `from` is exclusive: the user already has it, so its notes are not news.
        assert!(!tag_is_in_range("v1.0.0", "pkg", "1.0.0", "2.0.0"));
        assert!(!tag_is_in_range("v2.0.1", "pkg", "1.0.0", "2.0.0"));
        // `to` is inclusive: the version being installed is the point.
        assert!(tag_is_in_range("v2.0.0", "pkg", "1.0.0", "2.0.0"));
    }

    #[test]
    fn skips_a_monorepo_tag_naming_a_different_package() {
        assert!(!tag_is_in_range(
            "@storybook/vue@10.4.6",
            "@storybook/react",
            "10.4.5",
            "10.4.6"
        ));
    }

    #[test]
    fn falls_back_to_recent_releases_when_no_tag_matches() {
        let releases: Vec<ChangelogRelease> = (0..8)
            .map(|i| ChangelogRelease {
                tag: format!("release-{i}"),
                name: String::new(),
                published_at: String::new(),
                body: String::new(),
                url: String::new(),
            })
            .collect();

        let (selected, matched) = select_releases(releases, "pkg", "1.0.0", "2.0.0");
        assert!(!matched);
        assert_eq!(selected.len(), 5);
    }

    #[test]
    fn drops_drafts_and_prereleases() {
        let draft = serde_json::json!({ "tag_name": "v2.0.0", "draft": true });
        let prerelease = serde_json::json!({ "tag_name": "v2.0.0-rc.1", "prerelease": true });
        let real = serde_json::json!({
            "tag_name": "v2.0.0", "name": "Two", "published_at": "2026-01-01T00:00:00Z",
            "body": "notes", "html_url": "https://example.test/r"
        });

        assert!(read_release(&draft).is_none());
        assert!(read_release(&prerelease).is_none());
        let parsed = read_release(&real).unwrap();
        assert_eq!(parsed.tag, "v2.0.0");
        assert_eq!(parsed.body, "notes");
    }

    // ─── fetch_changelog ────────────────────────────────────────────────────
    //
    // These exercise the offline-decidable branches only. A genuine authenticated (or
    // unauthenticated) *success* round trip goes all the way through `github_api::request`'s real
    // `reqwest` call to `api.github.com`, and this codebase has no HTTP-mocking dependency to fake
    // that — `services/github_api.rs`'s own test module draws the same line, testing `guard_url` and
    // `e2e_redirect` but never `request()`'s actual network path. What *is* fully testable offline,
    // and is exactly the regression this module's `account_id` rename guards against, is that a
    // resolvable repo paired with an account whose credential cannot be found degrades to the base
    // changelog rather than erroring or (the original bug) sending the account id itself as a token.

    fn write_installed_package(dir: &Path, name: &str, repository: &str) {
        let pkg = dir.join("node_modules").join(name);
        fs::create_dir_all(&pkg).unwrap();
        fs::write(
            pkg.join("package.json"),
            format!(r#"{{"version":"1.0.0","repository":"{repository}"}}"#),
        )
        .unwrap();
    }

    #[tokio::test]
    async fn an_unresolvable_repository_returns_the_empty_changelog_without_any_network_call() {
        let dir = tmp("fetch-unresolved");

        let result = fetch_changelog(dir.to_str().unwrap(), "ghost", "1.0.0", "2.0.0", None)
            .await
            .unwrap();

        assert_eq!(result, empty_changelog());
        fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn an_account_with_no_stored_credential_degrades_to_the_base_changelog() {
        let dir = tmp("fetch-missing-credential");
        write_installed_package(&dir, "acme-thing", "acme/thing");

        // No test in this suite ever stores a credential under this id, on any backend, so the
        // lookup inside `github_api::request` is guaranteed to fail before any HTTP request is
        // attempted — this is what keeps the test deterministic and offline.
        let account_id = format!(
            "gm-test-no-such-package-changelog-account-{}",
            std::process::id()
        );

        let result = fetch_changelog(
            dir.to_str().unwrap(),
            "acme-thing",
            "1.0.0",
            "2.0.0",
            Some(account_id),
        )
        .await
        .unwrap();

        // Degrades gracefully rather than erroring or crashing: the repository still resolved
        // (offline, from the manifest), but no releases came back because the request never sent.
        assert_eq!(result.repository, Some("acme/thing".to_string()));
        assert_eq!(
            result.releases_url,
            Some("https://github.com/acme/thing/releases".to_string())
        );
        assert!(result.releases.is_empty());
        assert!(!result.matched);
        fs::remove_dir_all(&dir).ok();
    }
}
