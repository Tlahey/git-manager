import { create } from 'zustand'

/**
 * Non-persisted UI-only state for the Board (Kanban) view — the controls the app's own chrome draws
 * on the board's behalf, now that the toolbar and the left panel are scoped to the active view.
 *
 * - `search`: a live text filter over card titles, ANDed in by `BoardPage` regardless of which
 *   board/backend is active. Typed in the toolbar, applied by the page.
 * - `showClosed` / `showDeleted`: which boards the left panel's list offers. They were `useState` in
 *   `BoardPage` while the picker lived in the page's own header; the list moved to the sidebar and
 *   the two now have to be readable from there.
 *
 * Mirrors `launchpadControls.store.ts`'s split from the persisted `board.store.ts` (which board is
 * active / collapsed columns), which does survive a restart. Whether the board view is on screen at
 * all is neither here nor there: that is `repoView.store`'s single `view` slot.
 */
interface BoardControlsState {
  search: string
  setSearch: (search: string) => void
  /** Whether the floating search panel is on screen — opened from the toolbar or ⌘F. */
  isSearchOpen: boolean
  toggleSearch: () => void
  /**
   * Closing clears the query too: the search *filters the board*, so a stale filter left behind a
   * panel that is no longer on screen would hide cards with nothing to say why.
   */
  closeSearch: () => void
  /** Include closed sprints in the board list. */
  showClosed: boolean
  setShowClosed: (showClosed: boolean) => void
  /** Include boards deleted with their tickets archived — see `Board.deletedAt`. */
  showDeleted: boolean
  setShowDeleted: (showDeleted: boolean) => void
  /** Reset to defaults — called when the Board view unmounts so the filters don't linger. */
  reset: () => void
}

export const useBoardControlsStore = create<BoardControlsState>((set) => ({
  search: '',
  setSearch: (search) => set({ search }),
  isSearchOpen: false,
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
  closeSearch: () => set({ isSearchOpen: false, search: '' }),
  showClosed: false,
  setShowClosed: (showClosed) => set({ showClosed }),
  showDeleted: false,
  setShowDeleted: (showDeleted) => set({ showDeleted }),
  reset: () => set({ search: '', isSearchOpen: false, showClosed: false, showDeleted: false }),
}))
