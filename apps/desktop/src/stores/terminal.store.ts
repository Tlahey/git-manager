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

/** A command that has run to completion in a session the user has not looked at since. */
export interface TerminalFinished {
  /** Its name while it was running (`claude`, `pnpm`), when the backend could resolve one. */
  command: string | null
}

/** One session's busy state as of the last poll — the transition detector's memory. */
interface TerminalActivitySnapshot {
  busy: boolean
  /** Last command seen holding the foreground; kept after it ends, to name what finished. */
  command: string | null
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
  /**
   * Sessions whose command has finished and which the user has not looked at since — what turns a
   * chip blue. Keyed by session id; absent means "nothing to report".
   *
   * This is the one piece of terminal state that cannot be read off the backend: "finished" is a
   * *transition* (busy → idle) and "seen" is about the user, not the process. Both are therefore
   * derived here, from the polled snapshots, rather than asked for.
   */
  finished: Record<string, TerminalFinished>
  /** Previous poll's busy/command per session. Held in the store, not in a module-level variable,
   *  so a test resetting the store really does reset the detector. */
  lastActivity: Record<string, TerminalActivitySnapshot>

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
  /**
   * Folds a poll of `terminal_status` into the finished/seen bookkeeping: a session that was busy
   * and no longer is has finished; one that has started running again has nothing left to report.
   *
   * Idempotent — replaying the same statuses records no second transition, since the snapshot it
   * compares against is updated in the same pass. That is what lets it be called from the polling
   * hook without caring how many components happen to be mounted.
   */
  syncActivity: (statuses: Record<string, { busy: boolean; command: string | null }>) => void
  /** Clears a session's finished mark — the user has now looked at it. */
  markSeen: (id: string) => void
}

const MIN_HEIGHT = 120
const MAX_HEIGHT = 900

const clampHeight = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h))

export const useTerminalStore = create<TerminalState>((set, get) => ({
  open: false,
  height: 260,
  sessions: [],
  activeId: null,
  finished: {},
  lastActivity: {},

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
      // A closed session reports nothing: leaving its mark behind would keep a chip blue for a
      // shell that no longer exists, and the ids are never reused within a run.
      const { [id]: _finished, ...finished } = state.finished
      const { [id]: _activity, ...lastActivity } = state.lastActivity
      return { sessions, activeId, finished, lastActivity }
    }),

  setActiveSession: (id) => set({ activeId: id }),

  sessionsFor: (cwd) => get().sessions.filter((s) => s.cwd === cwd),

  syncActivity: (statuses) =>
    set((state) => {
      const lastActivity: Record<string, TerminalActivitySnapshot> = {}
      let finished = state.finished
      let finishedChanged = false
      const editFinished = () => {
        if (!finishedChanged) {
          finished = { ...finished }
          finishedChanged = true
        }
        return finished
      }

      for (const session of state.sessions) {
        const status = statuses[session.id]
        const busy = status?.busy ?? false
        const previous = state.lastActivity[session.id]
        lastActivity[session.id] = {
          busy,
          // While busy, take the name the poll reports; once idle, keep the last one seen — it is
          // what named the command that just finished, and the backend stops reporting it the
          // instant the prompt returns.
          command: busy
            ? (status?.command ?? previous?.command ?? null)
            : (previous?.command ?? null),
        }

        if (previous?.busy && !busy && !(session.id in finished)) {
          editFinished()[session.id] = { command: previous.command }
        } else if (busy && session.id in finished) {
          // Off again: whatever finished before is no longer the news about this session.
          delete editFinished()[session.id]
        }
      }

      return finishedChanged ? { lastActivity, finished } : { lastActivity }
    }),

  markSeen: (id) =>
    set((state) => {
      if (!(id in state.finished)) return state
      const { [id]: _seen, ...finished } = state.finished
      return { finished }
    }),
}))
