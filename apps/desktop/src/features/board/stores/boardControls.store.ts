import { create } from 'zustand'

/**
 * Non-persisted UI-only state for the Board (Kanban) view — the controls the app's own chrome draws
 * on the board's behalf, now that the toolbar and the left panel are scoped to the active view.
 *
 * All three narrow the **board list in the left panel**, and nothing else:
 *
 * - `boardFilter`: a live text filter over board names, typed in the panel it filters.
 * - `showClosed` / `showDeleted`: which boards that list offers. They were `useState` in `BoardPage`
 *   while the picker lived in the page's own header; the list moved to the sidebar and the two now
 *   have to be readable from there.
 *
 * **Finding a *ticket* is not here**, and used to be: this store carried a query that filtered the
 * open board's cards. Searching for a ticket is `BoardSearchDialog`'s job now — every card of every
 * board, raised by ⌘F and the toolbar's button — because "where is that ticket" has no reason to
 * start by asking which board it is on. Each search now narrows what its own control sits next to.
 *
 * Mirrors `launchpadControls.store.ts`'s split from the persisted `board.store.ts` (which board is
 * active / collapsed columns), which does survive a restart. Whether the board view is on screen at
 * all is neither here nor there: that is `repoView.store`'s single `view` slot.
 */
interface BoardControlsState {
  /** Narrows the panel's board list by name. */
  boardFilter: string
  setBoardFilter: (boardFilter: string) => void
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
  boardFilter: '',
  setBoardFilter: (boardFilter) => set({ boardFilter }),
  showClosed: false,
  setShowClosed: (showClosed) => set({ showClosed }),
  showDeleted: false,
  setShowDeleted: (showDeleted) => set({ showDeleted }),
  reset: () => set({ boardFilter: '', showClosed: false, showDeleted: false }),
}))
