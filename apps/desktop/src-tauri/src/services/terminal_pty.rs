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
}

impl TerminalSession {
    /// Writes raw bytes (keystrokes/paste) to the shell's stdin.
    pub fn write(&mut self, data: &[u8]) -> std::io::Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()
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

    Ok((
        TerminalSession {
            master: pair.master,
            writer,
            child,
        },
        reader,
    ))
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
