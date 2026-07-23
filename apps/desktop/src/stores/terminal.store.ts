import { create } from 'zustand'

/**
 * Client-side UI state for the integrated terminal panel: whether the bottom dock is open, its
 * height, and — per repo/worktree path — the list of open shell tabs and which one is active.
 *
 * Sessions are *live* PTYs owned by the Rust backend, keyed by the session id the backend returns
 * (`TerminalTab.id`); the matching xterm.js instance is held outside React in `lib/terminalRegistry`.
 * Nothing here is persisted — a fresh app launch starts with no sessions.
 */
export interface TerminalTab {
  /** Backend PTY session id — also the xterm registry key and the event-subscription suffix. */
  id: string
  /** Display label shown in the tab strip (e.g. "zsh 1"). */
  title: string
  /** The working directory the shell was spawned in (repo or worktree path). */
  cwd: string
}

interface RepoTerminals {
  tabs: TerminalTab[]
  activeId: string | null
}

interface TerminalState {
  /** Whether the bottom dock is visible. */
  open: boolean
  /** Panel height in pixels (shared across repos, VS Code style). */
  height: number
  /** Open sessions keyed by the effective repo/worktree path they belong to. */
  byPath: Record<string, RepoTerminals>

  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  setHeight: (height: number) => void

  /** Registers a freshly-opened backend session as a new tab under `path` and activates it. */
  addTab: (path: string, tab: TerminalTab) => void
  /** Removes a tab, activating a neighbour if the closed one was active. */
  removeTab: (path: string, id: string) => void
  setActiveTab: (path: string, id: string) => void
  /** The active tab list for `path` (empty when none opened yet). */
  tabsFor: (path: string) => RepoTerminals
}

const MIN_HEIGHT = 120
const MAX_HEIGHT = 900
const EMPTY: RepoTerminals = { tabs: [], activeId: null }

const clampHeight = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h))

export const useTerminalStore = create<TerminalState>((set, get) => ({
  open: false,
  height: 260,
  byPath: {},

  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
  togglePanel: () => set((state) => ({ open: !state.open })),
  setHeight: (height) => set({ height: clampHeight(height) }),

  addTab: (path, tab) =>
    set((state) => {
      const current = state.byPath[path] ?? EMPTY
      return {
        byPath: {
          ...state.byPath,
          [path]: { tabs: [...current.tabs, tab], activeId: tab.id },
        },
      }
    }),

  removeTab: (path, id) =>
    set((state) => {
      const current = state.byPath[path]
      if (!current) return state
      const index = current.tabs.findIndex((t) => t.id === id)
      const tabs = current.tabs.filter((t) => t.id !== id)
      let activeId = current.activeId
      if (activeId === id) {
        // Activate the previous tab, or the new first one, or nothing when the list is empty.
        const neighbour = tabs[Math.max(0, index - 1)]
        activeId = neighbour?.id ?? null
      }
      return { byPath: { ...state.byPath, [path]: { tabs, activeId } } }
    }),

  setActiveTab: (path, id) =>
    set((state) => {
      const current = state.byPath[path] ?? EMPTY
      return { byPath: { ...state.byPath, [path]: { ...current, activeId: id } } }
    }),

  tabsFor: (path) => get().byPath[path] ?? EMPTY,
}))
