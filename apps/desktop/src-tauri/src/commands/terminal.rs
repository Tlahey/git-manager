//! Integrated-terminal commands: open a PTY-backed shell session, stream its output to the frontend,
//! and relay keystrokes/resize/close. The real process/IO work lives in `services/terminal_pty.rs`;
//! this layer only manages the session map in `AppState` and the output-streaming thread.
//!
//! Output is streamed via per-session Tauri events so each xterm.js view only receives its own bytes:
//! - `terminal:output:<id>` — a `Vec<u8>` chunk of shell output.
//! - `terminal:exit:<id>`   — emitted once when the shell exits / the PTY closes.

use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::services::terminal_pty::spawn_shell;
use crate::state::AppState;

/// Monotonic counter making session ids unique within a process run.
static COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_id() -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("term-{}-{}", std::process::id(), n)
}

/// Opens a new PTY-backed shell in `cwd` (the active repo/worktree path), sized `cols`×`rows`, and
/// starts streaming its output. Returns the session id the frontend uses for writes/resizes/close
/// and to subscribe to `terminal:output:<id>` / `terminal:exit:<id>`.
#[tauri::command]
pub async fn terminal_open(
    app: AppHandle,
    state: State<'_, AppState>,
    cwd: String,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<String, String> {
    let cols = cols.unwrap_or(80);
    let rows = rows.unwrap_or(24);
    let (session, mut reader) = spawn_shell(&cwd, cols, rows)?;

    let id = next_id();
    state
        .terminals
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?
        .insert(id.clone(), session);

    // Stream PTY output until EOF, then drop the session and notify the frontend it exited.
    let app_for_thread = app.clone();
    let id_for_thread = id.clone();
    std::thread::spawn(move || {
        let output_event = format!("terminal:output:{id_for_thread}");
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let _ = app_for_thread.emit(&output_event, buf[..n].to_vec());
                }
                Err(_) => break,
            }
        }
        if let Some(state) = app_for_thread.try_state::<AppState>() {
            if let Ok(mut map) = state.terminals.lock() {
                map.remove(&id_for_thread);
            }
        }
        let _ = app_for_thread.emit(&format!("terminal:exit:{id_for_thread}"), ());
    });

    Ok(id)
}

/// Writes keystrokes/pasted text (`data`) to the shell's stdin.
#[tauri::command]
pub async fn terminal_write(
    state: State<'_, AppState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut map = state
        .terminals
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?;
    let session = map
        .get_mut(&id)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    session
        .write(data.as_bytes())
        .map_err(|e| format!("Failed to write to terminal: {e}"))
}

/// Resizes the PTY to match the xterm.js viewport (in character cells).
#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = state
        .terminals
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?;
    if let Some(session) = map.get(&id) {
        session.resize(cols, rows)?;
    }
    Ok(())
}

/// Closes a session: kills the shell process and removes it from the map. The streaming thread then
/// sees EOF and emits `terminal:exit:<id>`.
#[tauri::command]
pub async fn terminal_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let removed = state
        .terminals
        .lock()
        .map_err(|_| "Terminal state lock poisoned".to_string())?
        .remove(&id);
    if let Some(mut session) = removed {
        session.kill();
    }
    Ok(())
}
