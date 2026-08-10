import { create } from 'zustand'

/**
 * Shared controls for the Launchpad (Pull Requests) page's global toolbar, which sits above the
 * inner tab bar so a single search box and collapse/expand-all pair drive whichever tab is active.
 *
 * `search` is a live text filter every list tab ANDs into its own filtering. `collapseAllNonce` /
 * `expandAllNonce` are monotonic counters: bumping one broadcasts a "fold/unfold every group"
 * request that grouped tabs react to (flat lists simply ignore it). Client-side UI state only —
 * nothing here is persisted.
 */
interface LaunchpadControlsState {
  search: string
  setSearch: (search: string) => void
  collapseAllNonce: number
  expandAllNonce: number
  collapseAll: () => void
  expandAll: () => void
  /** Reset to defaults — called when the Launchpad page unmounts so the filter doesn't linger. */
  reset: () => void
}

export const useLaunchpadControlsStore = create<LaunchpadControlsState>((set) => ({
  search: '',
  setSearch: (search) => set({ search }),
  collapseAllNonce: 0,
  expandAllNonce: 0,
  collapseAll: () => set((s) => ({ collapseAllNonce: s.collapseAllNonce + 1 })),
  expandAll: () => set((s) => ({ expandAllNonce: s.expandAllNonce + 1 })),
  reset: () => set({ search: '' }),
}))
