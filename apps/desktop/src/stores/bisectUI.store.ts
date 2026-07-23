import { create } from 'zustand'

/** Which commit slot the next graph click fills during bisect setup. */
export type BisectSlot = 'bad' | 'good'

/**
 * UI-only state for starting a bisect by picking commits directly in the graph. The session itself
 * is server state (read via `useBisectState`, mutated through `api/git.api.ts`); this store only
 * drives setup: two slots (bad + good) the user fills by clicking commits in the ContentView, either
 * of which can be re-picked before validating. Clicking a commit fills the active slot; the active
 * slot auto-advances to whichever is still empty for a smooth two-click flow.
 */
interface BisectUIState {
  setupActive: boolean
  /** The slot a graph click currently fills. */
  activeSlot: BisectSlot
  pendingBadOid: string | null
  pendingGoodOid: string | null
  /** True when the session's working changes were auto-stashed at start (restored on reset). */
  autoStashed: boolean
  /** Confirm-stash dialog (shown at start when the worktree is dirty). */
  stashDialogOpen: boolean
  /** Enter setup, waiting for the bad commit first. */
  beginSetup: () => void
  /** Focus a slot so the next graph click (re-)fills it. */
  setActiveSlot: (slot: BisectSlot) => void
  /** Fill the active slot with a commit, then advance to the other slot if it's still empty. */
  pickCommit: (oid: string) => void
  /** Leave setup without starting a bisect. */
  cancelSetup: () => void
  setAutoStashed: (value: boolean) => void
  openStashDialog: () => void
  closeStashDialog: () => void
}

export const useBisectUIStore = create<BisectUIState>((set) => ({
  setupActive: false,
  activeSlot: 'bad',
  pendingBadOid: null,
  pendingGoodOid: null,
  autoStashed: false,
  stashDialogOpen: false,
  beginSetup: () =>
    set({ setupActive: true, activeSlot: 'bad', pendingBadOid: null, pendingGoodOid: null }),
  setActiveSlot: (slot) => set({ activeSlot: slot }),
  pickCommit: (oid) =>
    set((s) => {
      const pendingBadOid = s.activeSlot === 'bad' ? oid : s.pendingBadOid
      const pendingGoodOid = s.activeSlot === 'good' ? oid : s.pendingGoodOid
      // Advance to the other slot only if it's still empty, so re-picking a filled slot stays put.
      let activeSlot = s.activeSlot
      if (s.activeSlot === 'bad' && !pendingGoodOid) activeSlot = 'good'
      else if (s.activeSlot === 'good' && !pendingBadOid) activeSlot = 'bad'
      return { pendingBadOid, pendingGoodOid, activeSlot }
    }),
  cancelSetup: () =>
    set({
      setupActive: false,
      activeSlot: 'bad',
      pendingBadOid: null,
      pendingGoodOid: null,
      stashDialogOpen: false,
    }),
  setAutoStashed: (value) => set({ autoStashed: value }),
  openStashDialog: () => set({ stashDialogOpen: true }),
  closeStashDialog: () => set({ stashDialogOpen: false }),
}))
