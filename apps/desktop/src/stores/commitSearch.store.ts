import { create } from 'zustand'

/**
 * Open/close + query state for the floating commit search panel (⌘F), anchored top-right of
 * the graph content area. Client-side UI state only — nothing here is persisted. Driven from
 * anywhere via this store (toolbar button, keyboard shortcut, the panel itself).
 */
interface CommitSearchState {
  open: boolean
  query: string
  toggle: () => void
  closeSearch: () => void
  setQuery: (query: string) => void
}

export const useCommitSearchStore = create<CommitSearchState>((set) => ({
  open: false,
  query: '',
  toggle: () => set((state) => ({ open: !state.open })),
  closeSearch: () => set({ open: false, query: '' }),
  setQuery: (query) => set({ query }),
}))
