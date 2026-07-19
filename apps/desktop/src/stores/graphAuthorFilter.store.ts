import { create } from 'zustand'

/**
 * Selected-authors state for the graph's AUTHOR column filter (the funnel button in the column
 * header). Holds a set of author **emails** (lowercased) — picking one or more dims every graph
 * row not written by them, the same opacity treatment as the ⌘F commit search. Client-side UI
 * state only, not persisted; cleared when the active repo changes (see `GitGraph.tsx`).
 */
interface GraphAuthorFilterState {
  /** Selected author emails (lowercased). Empty = filter inactive (nothing dimmed). */
  selected: Set<string>
  /** Add the email if absent, remove it if already selected. */
  toggle: (email: string) => void
  /** Remove a single email (chip close button). */
  remove: (email: string) => void
  /** Drop every selection ("Clear filter"). */
  clear: () => void
}

export const useGraphAuthorFilterStore = create<GraphAuthorFilterState>((set) => ({
  selected: new Set<string>(),
  toggle: (email) =>
    set((state) => {
      const next = new Set(state.selected)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return { selected: next }
    }),
  remove: (email) =>
    set((state) => {
      if (!state.selected.has(email)) return state
      const next = new Set(state.selected)
      next.delete(email)
      return { selected: next }
    }),
  clear: () => set((state) => (state.selected.size === 0 ? state : { selected: new Set<string>() })),
}))
