import { create } from 'zustand'

/**
 * Focus request for the left panel's branch/section filter input (⌥⌘F).
 * A counter rather than a boolean so repeated presses always re-trigger the
 * effect that focuses the input, even if it was already focused.
 */
interface SidebarSearchState {
  focusToken: number
  requestFocus: () => void
}

export const useSidebarSearchStore = create<SidebarSearchState>((set) => ({
  focusToken: 0,
  requestFocus: () => set((state) => ({ focusToken: state.focusToken + 1 })),
}))
