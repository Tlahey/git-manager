//! Launches a repository's path in an external OS-level app: the user's chosen editor, the user's
//! chosen terminal, or the Finder. Filesystem/shell-driven only — no `git2` — kept apart from the
//! repo lifecycle commands in `repo.rs` for that reason.

use crate::error::AppError;

/// Opens a Git repository in the editor the user picked (an absolute path to a `.app` bundle or
/// an executable, selected through the native picker).
#[tauri::command]
pub async fn open_in_editor(path: String, command: String) -> Result<(), String> {
    if command.is_empty() {
        return Err(AppError::InvalidInput("No editor application configured".to_string()).into());
    }

    // macOS .app bundles (picked via the native file dialog) can't be
    // executed directly — they must be launched through `open -a`.
    #[cfg(target_os = "macos")]
    if command.ends_with(".app") {
        return std::process::Command::new("open")
            .args(["-a", &command, &path])
            .spawn()
            .map(|_| ())
            .map_err(|e| AppError::Io(e).into());
    }

    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd")
        .args(["/C", &command, &path])
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let status = std::process::Command::new(&command).arg(&path).spawn();

    status.map(|_| ()).map_err(|e| AppError::Io(e).into())
}

/// Opens a terminal in the given directory using the user's chosen application (an absolute path to
/// a `.app` bundle or an executable). An empty `command` means "use the system default terminal".
#[tauri::command]
pub async fn open_in_terminal(path: String, command: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // An empty command falls back to the system default terminal (Terminal.app). Both it and a
        // configured `.app` bundle (picked via the native file dialog) must be launched via `open -a`
        // rather than executed directly.
        if command.trim().is_empty() || command.ends_with(".app") {
            let app = if command.trim().is_empty() {
                "Terminal"
            } else {
                command.as_str()
            };
            return std::process::Command::new("open")
                .args(["-a", app, &path])
                .spawn()
                .map(|_| ())
                .map_err(|e| AppError::Io(e).into());
        }
    }

    #[cfg(not(target_os = "macos"))]
    if command.is_empty() {
        return Err(
            AppError::InvalidInput("No terminal application configured".to_string()).into(),
        );
    }

    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", &command])
        .current_dir(&path)
        .spawn();

    #[cfg(not(target_os = "windows"))]
    let status = std::process::Command::new(&command)
        .current_dir(&path)
        .spawn();

    status.map(|_| ()).map_err(|e| AppError::Io(e).into())
}

/// The arguments `open` needs to *reveal* a path rather than act on it.
///
/// The distinction is the whole command. Plain `open <path>` hands the path to its default
/// application: on a directory that happens to be the Finder, which is why this looked correct for
/// as long as its only caller passed a worktree directory — but on a file it launches an editor.
/// Pointed at `~/.git-manager/settings.json`, "Reveal in Finder" opened the configuration in
/// WebStorm.
///
/// `-R` is the reveal flag: it opens the enclosing folder with the item selected, which is what the
/// menu label promises for a file. A directory keeps the plain form, because someone revealing a
/// worktree wants to see what is inside it, not to see its own name highlighted one level up. A path
/// that does not exist (a configuration file nothing has written yet) falls back to its parent,
/// since `open` on a missing path does nothing at all — the exact failure this function exists to
/// stop shipping.
#[cfg(target_os = "macos")]
fn reveal_args(path: &std::path::Path) -> Vec<std::ffi::OsString> {
    use std::ffi::OsString;

    match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_dir() => vec![path.into()],
        Ok(_) => vec![OsString::from("-R"), path.into()],
        Err(_) => match path.parent() {
            Some(parent) if parent.exists() => vec![parent.into()],
            _ => vec![OsString::from("-R"), path.into()],
        },
    }
}

/// Reveals an arbitrary filesystem path in the Finder — e.g. a linked worktree's directory from the
/// commit graph's `WIP:<path>` row context menu, or the configuration file from Settings. Generic
/// over `activity_log`'s/`daily_summary_archive`'s reveal commands: those always point at one of the
/// app's own fixed directories, this one takes whatever path the caller already has in hand.
#[tauri::command]
pub async fn reveal_path_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(reveal_args(std::path::Path::new(&path)))
            .spawn()
            .map(|_| ())
            .map_err(|e| AppError::Io(e).into())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err(AppError::Unknown(
            "Revealing a path in the file manager is only supported on macOS".to_string(),
        )
        .into())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::fs;

    fn args(path: &std::path::Path) -> Vec<String> {
        reveal_args(path)
            .into_iter()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect()
    }

    #[test]
    fn a_file_is_revealed_rather_than_opened() {
        // The bug this exists to stop: plain `open` on `settings.json` launched WebStorm instead of
        // showing the file, because `open` hands a path to its default application.
        let dir = std::env::temp_dir().join("git-manager-reveal-test-file");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("settings.json");
        fs::write(&file, "{}").unwrap();

        assert_eq!(
            args(&file),
            vec!["-R".to_string(), file.to_string_lossy().to_string()]
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_directory_is_opened_so_its_contents_show() {
        // Someone revealing a worktree wants to see inside it, not its name selected one level up.
        let dir = std::env::temp_dir().join("git-manager-reveal-test-dir");
        fs::create_dir_all(&dir).unwrap();

        assert_eq!(args(&dir), vec![dir.to_string_lossy().to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_path_that_does_not_exist_yet_falls_back_to_its_folder() {
        // A configuration file nothing has written yet: `open` on a missing path does nothing at
        // all, which is indistinguishable from a broken button.
        let dir = std::env::temp_dir().join("git-manager-reveal-test-missing");
        fs::create_dir_all(&dir).unwrap();
        let absent = dir.join("settings.json");

        assert_eq!(args(&absent), vec![dir.to_string_lossy().to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_path_with_no_reachable_parent_still_asks_for_a_reveal() {
        assert_eq!(
            reveal_args(std::path::Path::new("/nope-does-not-exist/settings.json")),
            vec![
                OsString::from("-R"),
                OsString::from("/nope-does-not-exist/settings.json")
            ]
        );
    }
}
