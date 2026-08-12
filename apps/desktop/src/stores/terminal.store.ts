import { create } from 'zustand'

/**
 * Client-side UI state for the integrated terminal panel: whether the bottom dock is open, its
 * height, the live shell sessions, and which one the panel is showing.
 *
 * **A session is bound to the directory it was spawned in, and the panel follows the session — not
 * the view.** That is the whole point of the shape below, and the reason this is one flat list
 * rather than the `Record<path, tabs>` it used to be. A shell started on a worktree to run an agent
 * keeps that worktree's cwd for its whole life; entering another workspace changes what the graph,
 * the sidebar and the status bar are about, and changes nothing about the shell that is still
 * printing. Keying the panel by the *viewed* path meant the opposite: switching workspace swept a
 * running agent off screen and replaced it with an empty tab strip, and the only way back was to
 * switch the whole view back. Opening a new terminal while another workspace is on screen does bind
 * to that new workspace — `path` is read at spawn time — which is the other half of the same rule.
 *
 * Sessions are *live* PTYs owned by the Rust backend, keyed by the session id the backend returns
 * (`TerminalSession.id`); the matching xterm.js instance is held outside React in
 * `lib/terminalRegistry`. Nothing here is persisted — a fresh app launch starts with no sessions.
 */
export interface TerminalSession {
  /** Backend PTY session id — also the xterm registry key and the event-subscription suffix. */
  id: string
  /** Display label shown in the tab strip (e.g. "zsh 1"). */
  title: string
  /** The working directory the shell was spawned in (repo or worktree path), for its whole life. */
  cwd: string
}

interface TerminalState {
  /** Whether the bottom dock is visible. */
  open: boolean
  /** Panel height in pixels (shared across repos, VS Code style). */
  height: number
  /** Every live session, oldest first — across every repo tab and workspace. */
  sessions: TerminalSession[]
  /** The session the panel is showing, whichever directory it belongs to. */
  activeId: string | null

  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  setHeight: (height: number) => void

  /** Registers a freshly-opened backend session and makes it the one on screen. */
  addSession: (session: TerminalSession) => void
  /** Removes a session, activating a neighbour if the closed one was on screen. */
  removeSession: (id: string) => void
  setActiveSession: (id: string) => void
  /** The live sessions spawned in `cwd` (empty when none) — what the sidebar lists per worktree. */
  sessionsFor: (cwd: string) => TerminalSession[]
}

const MIN_HEIGHT = 120
const MAX_HEIGHT = 900

const clampHeight = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h))

export const useTerminalStore = create<TerminalState>((set, get) => ({
  open: false,
  height: 260,
  sessions: [],
  activeId: null,

  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  togglePanel: () => set((state) => ({ open: !state.open })),
  setHeight: (height) => set({ height: clampHeight(height) }),

  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session], activeId: session.id })),

  removeSession: (id) =>
    set((state) => {
      const index = state.sessions.findIndex((s) => s.id === id)
      if (index === -1) return state
      const sessions = state.sessions.filter((s) => s.id !== id)
      let activeId = state.activeId
      if (activeId === id) {
        // Activate the previous session, or the new first one, or nothing when the list is empty.
        activeId = sessions[Math.max(0, index - 1)]?.id ?? null
      }
      return { sessions, activeId }
    }),

  setActiveSession: (id) => set({ activeId: id }),

  sessionsFor: (cwd) => get().sessions.filter((s) => s.cwd === cwd),
}))
