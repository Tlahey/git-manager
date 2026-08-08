//! On-disk persistence for the application's whole configuration: `~/.git-manager/settings.json`.
//!
//! The configuration used to live in the webview's `localStorage`, which made it invisible to a
//! *packaged* build: WebKit keys its store off the running process, so the settings and open
//! repositories a user had in `pnpm dev` (and, worse, in a previous install) simply were not there —
//! the app came up empty with no way to tell that anything had been lost. A plain file in the
//! directory the app already owns fixes that, survives every version bump, and makes the
//! configuration inspectable, backup-able and portable like the rest of the app's state
//! (`themes/`, `summaries/`, `activity-logs/`).
//!
//! **Sections, not one blob.** The file is a map of top-level sections (`settings`, `workspace`,
//! `repositories`, …) with a `versions` map beside them, and a write names the one section it
//! changes. That is what makes a second window safe: every window loads the file at startup and then
//! holds its own copy of what it hydrated, so a whole-file write from a window that has been open
//! for an hour would roll back every section another window changed meanwhile. Read-modify-write of
//! a single key confines a stale writer to the section it actually touched.
//!
//! **The payload is opaque.** Sections are stored and returned verbatim as `serde_json::Value`. The
//! frontend owns the schema — the sections, their defaults, their zod validation and their
//! migrations all already exist there — and mirroring it here would mean a Rust struct to update on
//! every new setting, plus a second place for the two to disagree. This module knows only where the
//! file is, how to replace one key in it, and how not to lose it while doing so.
//!
//! **`GIT_MANAGER_NO_CONFIG`** switches the file off entirely: reads report nothing and writes do
//! nothing. That is what the e2e suite runs with (`apps/e2e/support/isolatedAppState.ts`) — the app
//! under test then persists to `localStorage` as it always did, so no run can read or write a
//! developer's real configuration, whatever `$HOME` happens to resolve to.

use crate::error::AppError;
use crate::utils::app_data_dir;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const FILE_NAME: &str = "settings.json";
const DISABLE_ENV: &str = "GIT_MANAGER_NO_CONFIG";
/// Holds one entry per section: the `zustand/persist` version its state was written at. Kept beside
/// the sections rather than inside them so a section stays a plain, readable object.
const VERSIONS_KEY: &str = "versions";

/// Whether the configuration file is switched off for this process.
///
/// Any non-empty value counts, `0` and `false` excepted — a variable set to `0` reads as "off" to
/// everyone who has ever exported one, and honouring that is cheaper than the bug report.
pub fn is_disabled() -> bool {
    disabled_by(std::env::var(DISABLE_ENV).ok().as_deref())
}

/// Split out from [`is_disabled`] so it is testable: `set_var` in a test binary mutates process
/// state every other test shares, which is exactly the kind of cross-test coupling this crate's
/// other suites go out of their way to avoid.
fn disabled_by(value: Option<&str>) -> bool {
    let Some(value) = value.map(str::trim) else {
        return false;
    };
    !value.is_empty() && value != "0" && !value.eq_ignore_ascii_case("false")
}

fn resolved_dir() -> Result<PathBuf, AppError> {
    app_data_dir().ok_or_else(|| AppError::Unknown("could not resolve home directory".into()))
}

/// The whole configuration file, or `None` when it doesn't exist yet.
///
/// A missing file is the normal state of a fresh install, not an error — the frontend falls back to
/// its defaults. An *unreadable* one is reported, so a permissions problem doesn't masquerade as a
/// first launch and get silently overwritten.
pub fn read() -> Result<Option<String>, AppError> {
    read_from(&resolved_dir()?)
}

/// Replaces one section and records the version it was written at, creating the file if needed.
///
/// A `null` value removes the section, which is what a store clearing its own storage means.
pub fn write_section(section: &str, version: u32, value: Value) -> Result<(), AppError> {
    write_section_in(&resolved_dir()?, section, version, value)
}

pub(crate) fn read_from(dir: &Path) -> Result<Option<String>, AppError> {
    match fs::read_to_string(dir.join(FILE_NAME)) {
        Ok(contents) => Ok(Some(contents)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::Io(e)),
    }
}

/// Serializes the read-modify-write below.
///
/// Tauri runs each command on its own task, and the app writes several sections at once as a matter
/// of course — the first launch after an update adopts a handful in one go, and any action that
/// touches two stores does the same. Without this, two writes interleave and the second one's
/// `rename` finds the temp file already renamed away by the first (`ENOENT`), losing a section
/// outright; the reads would race just as badly, each rebuilding the document from a version that
/// predates the other. The critical section is a few kilobytes of JSON and holds no `await`.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn write_section_in(
    dir: &Path,
    section: &str,
    version: u32,
    value: Value,
) -> Result<(), AppError> {
    // A poisoned lock means a previous writer panicked mid-write; the file is still intact (the
    // rename is what publishes it), so recovering and writing is strictly better than refusing to.
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let mut document = match read_from(dir)? {
        // A file that no longer parses is rebuilt rather than treated as fatal: refusing to write
        // would leave the user unable to change a single setting until they deleted it by hand, and
        // the frontend has already reported the parse failure it saw on the way in.
        Some(contents) => serde_json::from_str::<Value>(&contents)
            .ok()
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default(),
        None => Map::new(),
    };

    let versions = document
        .entry(VERSIONS_KEY)
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(versions) = versions.as_object_mut() {
        if value.is_null() {
            versions.remove(section);
        } else {
            versions.insert(section.to_string(), Value::from(version));
        }
    }

    if value.is_null() {
        document.remove(section);
    } else {
        document.insert(section.to_string(), value);
    }

    write_document(dir, &Value::Object(document))
}

/// Owner-only (`rw-------`).
///
/// The `settings` section still carries secrets in clear text — the GitHub/GitLab/Bitbucket account
/// tokens and the AI provider's API key, which the frontend holds because it signs its own HTTP
/// requests. That predates this file (they were in `localStorage`), but a readable JSON in the home
/// directory is a far easier thing to read, back up or copy by accident, so it must at least not be
/// world-readable. This is a floor, not the fix: the tokens belong in the OS keychain, with the
/// frontend never seeing them — tracked separately.
#[cfg(unix)]
const FILE_MODE: u32 = 0o600;

fn write_document(dir: &Path, document: &Value) -> Result<(), AppError> {
    fs::create_dir_all(dir)?;
    // Pretty-printed: this file is meant to be read and hand-edited, and one key per line is what
    // makes a change to it reviewable.
    let contents = serde_json::to_string_pretty(document)
        .map_err(|e| AppError::Unknown(format!("could not serialize the configuration: {e}")))?;
    // Write-then-rename, not a truncating write in place. The file is rewritten on every change, so
    // a crash or a power loss during one would otherwise leave it half-written — and a configuration
    // that no longer parses is indistinguishable, on the next launch, from a user who never had one.
    // `rename` within the same directory is atomic, so the file is always either the previous
    // version or the new one.
    let tmp = dir.join(format!("{FILE_NAME}.tmp"));
    fs::write(&tmp, contents)?;
    // Tightened on the temp file, before it is published: the permissions travel through `rename`,
    // so the configuration is never briefly world-readable the way a chmod after the fact would
    // leave it. Re-applied on every write, which also repairs a file created by an older build.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(FILE_MODE))?;
    }
    fs::rename(&tmp, dir.join(FILE_NAME))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Own temp directory per test — `read`/`write_section` resolve `$HOME`, and mutating it would
    /// race with every other test in the binary, so the tests drive the `*_from`/`*_in` pair.
    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("git-manager-config-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn document(dir: &Path) -> Value {
        serde_json::from_str(&read_from(dir).unwrap().unwrap()).unwrap()
    }

    #[test]
    fn reading_before_anything_was_written_is_not_an_error() {
        assert_eq!(read_from(&temp_dir("absent")).unwrap(), None);
    }

    #[test]
    fn writes_a_section_with_its_version_and_reads_it_back() {
        let dir = temp_dir("roundtrip");
        write_section_in(&dir, "settings", 1, json!({ "language": "fr" })).unwrap();

        let doc = document(&dir);
        assert_eq!(doc["settings"]["language"], json!("fr"));
        assert_eq!(doc["versions"]["settings"], json!(1));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn writing_one_section_leaves_the_others_untouched() {
        // The whole reason writes are per-section: a second window holding an hour-old copy of the
        // document must not be able to roll back what another window changed meanwhile.
        let dir = temp_dir("isolation");
        write_section_in(&dir, "settings", 1, json!({ "language": "fr" })).unwrap();
        write_section_in(&dir, "workspace", 0, json!({ "openTabs": ["/a"] })).unwrap();
        write_section_in(&dir, "settings", 1, json!({ "language": "en" })).unwrap();

        let doc = document(&dir);
        assert_eq!(doc["settings"]["language"], json!("en"));
        assert_eq!(doc["workspace"]["openTabs"], json!(["/a"]));
        assert_eq!(doc["versions"]["workspace"], json!(0));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_section_is_replaced_wholesale_not_merged() {
        // Otherwise removing a key would be impossible: a store dropping a field would keep it.
        let dir = temp_dir("replace");
        write_section_in(&dir, "settings", 1, json!({ "a": 1, "b": 2 })).unwrap();
        write_section_in(&dir, "settings", 1, json!({ "a": 1 })).unwrap();

        assert_eq!(document(&dir)["settings"], json!({ "a": 1 }));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_null_value_removes_the_section_and_its_version() {
        let dir = temp_dir("remove");
        write_section_in(&dir, "settings", 1, json!({ "language": "fr" })).unwrap();
        write_section_in(&dir, "workspace", 0, json!({})).unwrap();
        write_section_in(&dir, "settings", 1, Value::Null).unwrap();

        let doc = document(&dir);
        assert!(doc.get("settings").is_none());
        assert!(doc["versions"].get("settings").is_none());
        assert!(doc.get("workspace").is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rebuilds_a_file_that_no_longer_parses_instead_of_refusing_to_write() {
        let dir = temp_dir("corrupt");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), "{ not json").unwrap();

        write_section_in(&dir, "settings", 1, json!({ "language": "fr" })).unwrap();
        assert_eq!(document(&dir)["settings"]["language"], json!("fr"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn leaves_no_temp_file_behind() {
        let dir = temp_dir("tmp");
        write_section_in(&dir, "settings", 1, json!({})).unwrap();
        write_section_in(&dir, "settings", 1, json!({})).unwrap();

        assert!(!dir.join(format!("{FILE_NAME}.tmp")).exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn concurrent_writes_all_land_instead_of_racing_each_other() {
        // Found in the running app, not in review: the first launch after the move adopted four
        // sections at once and three of them failed with `ENOENT` — every write staged through the
        // same temp file, and the fastest `rename` pulled it out from under the others. The
        // surviving file was missing whole sections, silently.
        let dir = temp_dir("concurrent");
        let sections = [
            "settings",
            "workspace",
            "repositories",
            "dashboard",
            "board",
        ];

        std::thread::scope(|scope| {
            for (index, section) in sections.iter().enumerate() {
                let dir = dir.clone();
                scope.spawn(move || {
                    write_section_in(&dir, section, index as u32, json!({ "n": index })).unwrap();
                });
            }
        });

        let doc = document(&dir);
        for (index, section) in sections.iter().enumerate() {
            assert_eq!(doc[*section], json!({ "n": index }), "{section} was lost");
            assert_eq!(doc["versions"][*section], json!(index));
        }
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn the_file_is_owner_only() {
        // It holds the GitHub token and the AI API key in clear text until those move to the
        // keychain; `0644` would hand them to every account on the machine.
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("mode");
        write_section_in(&dir, "settings", 1, json!({ "language": "fr" })).unwrap();

        let mode = fs::metadata(dir.join(FILE_NAME))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, FILE_MODE);
        let _ = fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn a_file_left_world_readable_by_an_older_build_is_repaired_on_the_next_write() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir("mode-repair");
        write_section_in(&dir, "settings", 1, json!({})).unwrap();
        fs::set_permissions(dir.join(FILE_NAME), fs::Permissions::from_mode(0o644)).unwrap();

        write_section_in(&dir, "settings", 1, json!({ "language": "fr" })).unwrap();

        let mode = fs::metadata(dir.join(FILE_NAME))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, FILE_MODE);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn creates_the_app_directory_on_first_write() {
        let dir = temp_dir("mkdir").join("nested");
        write_section_in(&dir, "settings", 1, json!({})).unwrap();
        assert!(dir.join(FILE_NAME).exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_kill_switch_reads_falsey_values_as_off() {
        // Set by the e2e suite; a developer exporting `0` means off, not "any value counts".
        assert!(disabled_by(Some("1")));
        assert!(disabled_by(Some("true")));
        assert!(disabled_by(Some(" yes ")));
        assert!(!disabled_by(Some("0")));
        assert!(!disabled_by(Some("false")));
        assert!(!disabled_by(Some("")));
        assert!(!disabled_by(None));
    }
}
