import { terminalClose, terminalOpen, terminalResize, terminalWrite } from '../lib/tauri'

/** Opens a PTY-backed login shell in `cwd` (a repo/worktree path) and returns its session id. */
export function apiTerminalOpen(cwd: string, cols: number, rows: number): Promise<string> {
  return terminalOpen(cwd, cols, rows)
}

/** Sends keystrokes/pasted text to the shell identified by `id`. */
export function apiTerminalWrite(id: string, data: string): Promise<void> {
  return terminalWrite(id, data)
}

/** Resizes the PTY behind session `id` to `cols`×`rows` character cells. */
export function apiTerminalResize(id: string, cols: number, rows: number): Promise<void> {
  return terminalResize(id, cols, rows)
}

/** Kills the shell process behind session `id`. */
export function apiTerminalClose(id: string): Promise<void> {
  return terminalClose(id)
}
