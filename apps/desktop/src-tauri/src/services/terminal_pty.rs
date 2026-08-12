//! Integrated-terminal PTY backend: spawns the user's login shell inside a real pseudo-terminal so
//! the in-app terminal behaves like a native one (colours, cursor keys, `~/.zshrc` sourced, etc.).
//!
//! This is a *service* rather than a thin command because it owns non-trivial process/IO plumbing
//! (openpty, spawn, reader/writer handles). The `commands/terminal.rs` layer stays thin: it stores
//! sessions in `AppState`, streams reader output to the frontend, and relays input/resize/close.
//!
//! v1 targets macOS/Linux (unix PTYs). The shell is `$SHELL` (falling back to `/bin/zsh`) started
//! as an interactive login shell (`-i -l`) — interactive is what makes zsh source `~/.zshrc`, login
//! is what sources `~/.zprofile`/`~/.zlogin`, together reproducing the user's real terminal env.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};

/// A live PTY session: the master handle (for resizing), its writer (for keystrokes), and the child
/// shell process (killed on close). The reader half is moved into a streaming thread by the caller.
pub struct TerminalSession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    /// PID of the shell itself — the reference `foreground_pid` is compared against to tell an idle
    /// prompt from a running command. `None` only if the platform can't report it.
    shell_pid: Option<u32>,
}

impl TerminalSession {
    /// Writes raw bytes (keystrokes/paste) to the shell's stdin.
    pub fn write(&mut self, data: &[u8]) -> std::io::Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()
    }

    /// The PID of the process group currently in the *foreground* of this PTY — i.e. the one that
    /// owns the keyboard. `tcgetpgrp(2)`, via portable-pty.
    ///
    /// This is what makes "a terminal is working" an observable fact rather than a guess: an idle
    /// shell puts *itself* in the foreground, so the value equals `shell_pid`; the moment the user
    /// runs anything, the shell forks it into its own foreground group and the value changes. An
    /// output-timing heuristic was the alternative and it is strictly worse — a long-thinking agent
    /// prints nothing for a minute and would read as idle, while a finished `ls` would read as busy
    /// for as long as the window lasted.
    #[cfg(unix)]
    pub fn foreground_pid(&self) -> Option<i32> {
        self.master.process_group_leader()
    }

    #[cfg(not(unix))]
    pub fn foreground_pid(&self) -> Option<i32> {
        None
    }

    /// Whether a command is running in the foreground (see {@link foreground_pid}). False for an
    /// idle prompt, and false whenever the platform can't answer — never a false "busy".
    pub fn is_busy(&self) -> bool {
        match (self.foreground_pid(), self.shell_pid) {
            (Some(foreground), Some(shell)) => foreground != shell as i32,
            _ => false,
        }
    }

    /// Resizes the PTY so the shell (and full-screen TUIs) re-flow to the xterm.js viewport.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize terminal: {e}"))
    }

    /// Terminates the shell process. Best-effort — a shell that has already exited returns an error
    /// we intentionally ignore.
    pub fn kill(&mut self) {
        let _ = self.child.kill();
    }
}

/// The shell to launch: `$SHELL` if set, else the macOS default `/bin/zsh`.
fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

/// Spawns the login shell in a fresh PTY sized `cols`×`rows`, rooted at `cwd`. Returns the session
/// (stored in `AppState`) and the reader half (streamed to the frontend by the calling command).
pub fn spawn_shell(
    cwd: &str,
    cols: u16,
    rows: u16,
) -> Result<(TerminalSession, Box<dyn Read + Send>), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open pty: {e}"))?;

    let shell = default_shell();
    let mut cmd = CommandBuilder::new(&shell);
    // Interactive (`-i`) so zsh sources ~/.zshrc; login (`-l`) so it sources ~/.zprofile/~/.zlogin.
    cmd.arg("-i");
    cmd.arg("-l");
    cmd.cwd(cwd);
    // Inherit the parent environment, then force a colour-capable terminal type for xterm.js.
    for (key, value) in std::env::vars() {
        cmd.env(key, value);
    }
    cmd.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;
    // Drop the slave so the master reader sees EOF once the shell exits.
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to read terminal: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to write terminal: {e}"))?;

    let shell_pid = child.process_id();

    Ok((
        TerminalSession {
            master: pair.master,
            writer,
            child,
            shell_pid,
        },
        reader,
    ))
}

/// Names the command running in the foreground of a PTY, given its `ps -o args=` line.
///
/// The first token's file name is the answer for a native binary (`/usr/bin/vim` → `vim`), but not
/// for the interpreted CLIs this is mostly about: an agent installed through npm shows up as
/// `node /Users/.../bin/claude`, and answering "node" would make every such session look alike. So
/// when the first token is a known interpreter, the script it was handed is the name instead —
/// skipping the flags in between (`node --enable-source-maps foo.js` → `foo.js`).
pub fn command_label(args: &str) -> Option<String> {
    let mut tokens = args.split_whitespace();
    let first = tokens.next()?;
    let name = file_name_of(first);
    const INTERPRETERS: [&str; 8] = [
        "node", "bun", "deno", "python", "python3", "ruby", "perl", "php",
    ];
    if !INTERPRETERS.contains(&name.as_str()) {
        return Some(name);
    }
    // The first token that isn't a flag is the script; fall back to the interpreter itself when it
    // was started with no script at all (a bare REPL).
    tokens
        .find(|token| !token.starts_with('-'))
        .map(file_name_of)
        .or(Some(name))
}

fn file_name_of(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

/// Reads the foreground command's `ps` line and names it (see {@link command_label}). `None` when
/// the process is already gone — a command that ends between the status snapshot and this call.
pub fn describe_process(pid: i32) -> Option<String> {
    let output = std::process::Command::new("ps")
        .args(["-o", "args=", "-p", &pid.to_string()])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&output.stdout);
    command_label(line.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_shell_prefers_env() {
        // Whatever the CI env is, the fallback must be a zsh path when SHELL is unset.
        let fallback = "/bin/zsh";
        let resolved = std::env::var("SHELL").unwrap_or_else(|_| fallback.to_string());
        assert_eq!(default_shell(), resolved);
    }

    #[test]
    fn command_label_names_a_native_binary_by_its_file_name() {
        assert_eq!(
            command_label("/usr/bin/vim file.txt").as_deref(),
            Some("vim")
        );
        assert_eq!(command_label("pnpm run dev").as_deref(), Some("pnpm"));
    }

    #[test]
    fn command_label_names_the_script_an_interpreter_was_handed() {
        assert_eq!(
            command_label("node /Users/me/.nvm/versions/node/v22.0.0/bin/claude --resume")
                .as_deref(),
            Some("claude")
        );
        assert_eq!(
            command_label("/opt/homebrew/bin/node --enable-source-maps ./tools/build.js")
                .as_deref(),
            Some("build.js")
        );
        // A bare REPL has no script to name, so the interpreter is the answer.
        assert_eq!(command_label("python3").as_deref(), Some("python3"));
        assert_eq!(command_label("node -i").as_deref(), Some("node"));
    }

    #[test]
    fn command_label_is_none_for_an_empty_line() {
        assert_eq!(command_label(""), None);
        assert_eq!(command_label("   "), None);
    }

    #[test]
    fn an_idle_shell_is_not_busy() {
        let (mut session, _reader) = spawn_shell("/", 80, 24).expect("spawn shell");
        // The shell puts itself in the foreground as soon as it takes control of the pty; poll
        // briefly rather than assuming it has got there by the time we look.
        let mut foreground = None;
        for _ in 0..50 {
            foreground = session.foreground_pid();
            if foreground.is_some() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert!(foreground.is_some(), "pty should report a foreground group");
        assert!(!session.is_busy(), "an idle prompt must not read as busy");
        session.kill();
    }

    #[test]
    fn spawns_and_streams_a_shell() {
        let (mut session, mut reader) = spawn_shell("/", 80, 24).expect("spawn shell");
        // Ask the shell to echo a marker, then read until we see it (or the pipe closes).
        session
            .write(b"printf MARKER_OK\\n; exit\n")
            .expect("write");
        let mut out = Vec::new();
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    out.extend_from_slice(&buf[..n]);
                    if String::from_utf8_lossy(&out).contains("MARKER_OK") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        session.kill();
        assert!(String::from_utf8_lossy(&out).contains("MARKER_OK"));
    }
}
