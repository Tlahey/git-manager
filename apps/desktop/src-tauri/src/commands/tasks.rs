//! Project task runner: launches a user-defined shell command (dev server, build, tests…) in the
//! user's configured external terminal, in the repo directory. This is intentionally a *thin*,
//! service-less command (like `github.rs`/`ssh.rs`) — it shells out rather than doing `git2` work.
//!
//! v1 targets macOS. Per configured terminal:
//! - Terminal.app / iTerm — driven via AppleScript `do script`/`write text`, so the command runs in
//!   the user's normal interactive shell and *stays* in the project directory (`cd <repo> && <cmd>`).
//! - Warp — has no `-e <command>` CLI, so we write a temp Warp *launch configuration* YAML (with the
//!   repo as `cwd` and the command in `commands`) and open it via the `warp://launch/<path>` URI.
//! - Anything else — falls back to a temp executable `.command` script opened with `open -a`.
//!
//! A temp `.command` file was the original approach for every terminal but it left the shell in the
//! script's own temp dir, which is why scriptable terminals now `cd` explicitly. Linux/Windows are
//! best-effort.

/// POSIX single-quotes a string so paths/commands with spaces or quotes survive the shell.
#[cfg(target_os = "macos")]
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// The shell line the terminal runs: `cd '<repo>' && <command>`. The command is written verbatim —
/// it is the user's own shell input (equivalent to an npm script). Kept pure for unit tests.
#[cfg(target_os = "macos")]
fn build_shell_command(path: &str, command: &str) -> String {
    format!("cd {} && {}", shell_quote(path), command)
}

/// Escapes a string for embedding inside an AppleScript double-quoted literal.
#[cfg(target_os = "macos")]
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Double-quotes a string for a YAML scalar, escaping `\` and `"`.
#[cfg(target_os = "macos")]
fn yaml_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Builds a Warp launch-configuration YAML that opens one tab in `path` running `command`.
#[cfg(target_os = "macos")]
fn build_warp_launch_config(path: &str, command: &str) -> String {
    format!(
        "---\nname: git-manager-task\nwindows:\n  - tabs:\n      - layout:\n          cwd: {}\n          commands:\n            - exec: {}\n",
        yaml_quote(path),
        yaml_quote(command)
    )
}

/// The fixed launch-configuration name Warp opens via `warp://launch/<name>`.
#[cfg(target_os = "macos")]
const WARP_CONFIG_NAME: &str = "git-manager-task";

/// AppleScript opening a new Terminal.app window running `shell_command`.
#[cfg(target_os = "macos")]
fn terminal_applescript(shell_command: &str) -> String {
    format!(
        "tell application \"Terminal\"\nactivate\ndo script \"{}\"\nend tell",
        escape_applescript(shell_command)
    )
}

/// AppleScript opening a new iTerm window running `shell_command`.
#[cfg(target_os = "macos")]
fn iterm_applescript(shell_command: &str) -> String {
    format!(
        "tell application \"iTerm\"\nactivate\nset newWindow to (create window with default profile)\ntell current session of newWindow to write text \"{}\"\nend tell",
        escape_applescript(shell_command)
    )
}

#[cfg(target_os = "macos")]
fn run_osascript(script: &str) -> Result<(), String> {
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to launch task: {e}"))
}

/// Launches Warp by writing its launch-configuration YAML into `~/.warp/launch_configurations/`
/// (the location Warp reads) under a fixed name, then opening it via `warp://launch/<name>`. The
/// fixed name means one reusable config, overwritten each launch, rather than clutter accumulating.
#[cfg(target_os = "macos")]
fn run_warp(path: &str, command: &str) -> Result<(), String> {
    use std::io::Write;

    let home = std::env::var("HOME").map_err(|_| "Could not find home directory".to_string())?;
    let dir = std::path::Path::new(&home)
        .join(".warp")
        .join("launch_configurations");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create Warp config dir: {e}"))?;

    let config_path = dir.join(format!("{WARP_CONFIG_NAME}.yaml"));
    std::fs::File::create(&config_path)
        .and_then(|mut f| f.write_all(build_warp_launch_config(path, command).as_bytes()))
        .map_err(|e| format!("Failed to write Warp launch config: {e}"))?;

    std::process::Command::new("open")
        .arg(format!("warp://launch/{WARP_CONFIG_NAME}"))
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to launch task: {e}"))
}

/// Fallback for non-scriptable terminals (Warp, Alacritty, kitty…): a temp executable `*.command`
/// script (`cd <repo>` then the command) opened with the configured app.
#[cfg(target_os = "macos")]
fn run_via_command_file(path: &str, command: &str, terminal_command: &str) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;

    let script = format!("#!/bin/sh\ncd {} || exit 1\n{command}\n", shell_quote(path));
    let file_name = format!("git-manager-task-{}.command", std::process::id());
    let script_path = std::env::temp_dir().join(file_name);

    let mut file = std::fs::File::create(&script_path)
        .map_err(|e| format!("Failed to create launch script: {e}"))?;
    file.write_all(script.as_bytes())
        .map_err(|e| format!("Failed to write launch script: {e}"))?;
    let mut perms = file
        .metadata()
        .map_err(|e| format!("Failed to read script metadata: {e}"))?
        .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&script_path, perms)
        .map_err(|e| format!("Failed to make launch script executable: {e}"))?;

    let mut open = std::process::Command::new("open");
    if !terminal_command.trim().is_empty() {
        open.args(["-a", terminal_command]);
    }
    open.arg(&script_path);
    open.spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to launch task: {e}"))
}

/// Runs `command` in the user's external terminal, with the repo at `path` as the working directory.
/// `terminal_command` is the configured terminal app (a `.app` path on macOS); empty means "use the
/// system default terminal" (Terminal.app on macOS).
// The per-OS `#[cfg]` blocks each end in an explicit `return` so the dispatch reads uniformly; on
// any single target one block is the tail, which clippy flags as needless — allow it here.
#[allow(clippy::needless_return)]
#[tauri::command]
pub async fn run_task_in_terminal(
    path: String,
    command: String,
    terminal_command: String,
) -> Result<(), String> {
    if command.trim().is_empty() {
        return Err("No command configured for this task".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let lower = terminal_command.to_lowercase();
        if lower.contains("iterm") {
            return run_osascript(&iterm_applescript(&build_shell_command(&path, &command)));
        }
        if lower.contains("warp") {
            return run_warp(&path, &command);
        }
        if lower.trim().is_empty() || lower.contains("terminal") {
            return run_osascript(&terminal_applescript(&build_shell_command(&path, &command)));
        }
        return run_via_command_file(&path, &command, &terminal_command);
    }

    #[cfg(target_os = "windows")]
    {
        let _ = &terminal_command;
        return std::process::Command::new("cmd")
            .args(["/C", "start", "cmd", "/K", &command])
            .current_dir(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to launch task: {e}"));
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = &terminal_command;
        return std::process::Command::new("x-terminal-emulator")
            .args(["-e", "sh", "-c", &format!("{command}; exec sh")])
            .current_dir(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to launch task: {e}"));
    }
}

// ─── Project command discovery ──────────────────────────────────────────────
//
// Surfaces runnable commands the project already declares, so the task editor can autocomplete them
// instead of making the user retype `pnpm dev`. Only package.json `scripts` today, but the
// `source` field and the generic return type leave room for more providers (Makefile, justfile…).

/// A runnable command discovered in the project (today: a package.json script).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommand {
    /// The script name, e.g. `dev`.
    pub name: String,
    /// The shell command that runs it via the detected package manager, e.g. `pnpm dev`.
    pub command: String,
    /// The raw script body (shown as a hint), e.g. `vite`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// Where this command came from, e.g. `package.json` — lets the source list grow later.
    pub source: String,
}

/// Extracts `{name → body}` string entries from a package.json's `scripts` object, sorted by name.
/// Returns empty for malformed JSON or a missing/!string scripts map (a best-effort convenience).
fn parse_package_scripts(json: &str) -> Vec<(String, String)> {
    let value: serde_json::Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let mut scripts: Vec<(String, String)> = value
        .get("scripts")
        .and_then(|s| s.as_object())
        .into_iter()
        .flatten()
        .filter_map(|(name, body)| body.as_str().map(|b| (name.clone(), b.to_string())))
        .collect();
    scripts.sort_by(|a, b| a.0.cmp(&b.0));
    scripts
}

/// Picks the package manager from the repo's lockfile, defaulting to npm.
fn detect_package_manager(repo: &std::path::Path) -> &'static str {
    if repo.join("pnpm-lock.yaml").exists() {
        "pnpm"
    } else if repo.join("yarn.lock").exists() {
        "yarn"
    } else if repo.join("bun.lockb").exists() || repo.join("bun.lock").exists() {
        "bun"
    } else {
        "npm"
    }
}

/// The shell command that runs a named script under `pm` (npm/bun need `run`, pnpm/yarn don't).
fn script_command(pm: &str, name: &str) -> String {
    match pm {
        "npm" | "bun" => format!("{pm} run {name}"),
        _ => format!("{pm} {name}"),
    }
}

/// Lists the runnable commands declared by the project at `path` (currently package.json scripts,
/// translated to the detected package manager). Returns an empty list when there's no package.json.
#[tauri::command]
pub async fn get_project_commands(path: String) -> Result<Vec<ProjectCommand>, String> {
    let repo = std::path::Path::new(&path);
    let pkg = repo.join("package.json");
    if !pkg.exists() {
        return Ok(Vec::new());
    }
    let content =
        std::fs::read_to_string(&pkg).map_err(|e| format!("Failed to read package.json: {e}"))?;
    let pm = detect_package_manager(repo);
    let commands = parse_package_scripts(&content)
        .into_iter()
        .map(|(name, body)| ProjectCommand {
            command: script_command(pm, &name),
            detail: Some(body),
            name,
            source: "package.json".to_string(),
        })
        .collect();
    Ok(commands)
}

#[cfg(test)]
mod project_tests {
    use super::*;

    #[test]
    fn parses_and_sorts_scripts() {
        let json = r#"{"scripts":{"dev":"vite","build":"tsc"},"name":"x"}"#;
        assert_eq!(
            parse_package_scripts(json),
            vec![
                ("build".to_string(), "tsc".to_string()),
                ("dev".to_string(), "vite".to_string()),
            ]
        );
    }

    #[test]
    fn returns_empty_for_no_scripts_or_bad_json() {
        assert!(parse_package_scripts(r#"{"name":"x"}"#).is_empty());
        assert!(parse_package_scripts("not json").is_empty());
    }

    #[test]
    fn script_command_matches_package_manager() {
        assert_eq!(script_command("pnpm", "dev"), "pnpm dev");
        assert_eq!(script_command("yarn", "dev"), "yarn dev");
        assert_eq!(script_command("npm", "dev"), "npm run dev");
        assert_eq!(script_command("bun", "dev"), "bun run dev");
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn builds_cd_then_command() {
        assert_eq!(
            build_shell_command("/home/me/proj", "pnpm dev"),
            "cd '/home/me/proj' && pnpm dev"
        );
    }

    #[test]
    fn quotes_path_with_spaces() {
        assert_eq!(
            build_shell_command("/Users/me/My Projects/app", "pnpm test"),
            "cd '/Users/me/My Projects/app' && pnpm test"
        );
    }

    #[test]
    fn escapes_single_quotes_in_path() {
        // POSIX single-quote escaping: ' -> '\''
        assert_eq!(shell_quote("/tmp/o'brien"), "'/tmp/o'\\''brien'");
    }

    #[test]
    fn preserves_command_verbatim() {
        let shell = build_shell_command("/x", "pnpm test && pnpm lint");
        assert!(shell.ends_with("&& pnpm test && pnpm lint"));
    }

    #[test]
    fn escapes_applescript_specials() {
        assert_eq!(escape_applescript(r#"say "hi" \n"#), r#"say \"hi\" \\n"#);
    }

    #[test]
    fn terminal_script_wraps_the_command() {
        let script = terminal_applescript("cd '/x' && pnpm dev");
        assert!(script.contains("tell application \"Terminal\""));
        assert!(script.contains("do script \"cd '/x' && pnpm dev\""));
    }

    #[test]
    fn warp_config_sets_cwd_and_command() {
        let yaml = build_warp_launch_config("/Users/me/proj", "pnpm dev");
        assert!(yaml.contains("cwd: \"/Users/me/proj\""));
        assert!(yaml.contains("- exec: \"pnpm dev\""));
    }

    #[test]
    fn warp_config_quotes_paths_with_spaces() {
        let yaml = build_warp_launch_config("/Users/me/My App", "pnpm dev");
        assert!(yaml.contains("cwd: \"/Users/me/My App\""));
    }
}
