import { create } from 'zustand'

/**
 * Non-persisted UI-only state for the Board (Kanban) page — a live text filter over card titles,
 * ANDed in by `BoardPage` regardless of which board/backend is active, plus whether the board panel
 * itself is showing. Mirrors `launchpadControls.store.ts`'s split from the persisted
 * `board.store.ts` (board switcher / collapsed-column state), which does survive a restart.
 *
 * `isOpen` is a single global flag, not keyed per repo — the same choice `fileExplorer.store.ts`
 * makes for `isOpen`/`isSidebarOpen`. The board panel and the file explorer share one central-area
 * slot in `RepoGraphWorkspace` (alongside the graph), so opening one closes the other; see
 * `ActionToolbar`'s board/files toggle buttons for where that's enforced.
 */
interface BoardControlsState {
  search: string
  setSearch: (search: string) => void
  isOpen: boolean
  setOpen: (isOpen: boolean) => void
  /** Reset to defaults — called when the Board page unmounts so the filter doesn't linger. */
  reset: () => void
}

export const useBoardControlsStore = create<BoardControlsState>((set) => ({
  search: '',
  setSearch: (search) => set({ search }),
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  reset: () => set({ search: '' }),
}))
