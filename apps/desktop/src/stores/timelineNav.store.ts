import { create } from 'zustand'

/**
 * Ephemeral (never persisted) navigation state for the undo/redo timeline overlay. It only tracks
 * *where the selector is pointing* while the user scrubs — it never mutates the repo or the undo
 * history. The real git operations happen once, on "validate", from `TimelineBar`. Keyed by repo
 * path so switching tabs while the timeline is open doesn't leak one repo's preview onto another.
 */
interface TimelineNavState {
  isOpen: boolean
  repoPath: string | null
  /** Step index the selector currently previews (0 = initial state). */
  previewIndex: number
  /**
   * HEAD commit OID of the previewed step, published so the graph can render that commit's changes
   * read-only at the center — decoupled from the graph's own selection machinery so previewing
   * never moves the real selection, scrolls the list, or fires a "commit not found" toast. `null`
   * for steps that don't map to a commit (discard, stash, branch/tag/remote CRUD).
   */
  previewHeadOid: string | null
  open: (repoPath: string, startIndex: number) => void
  close: () => void
  setPreviewIndex: (index: number) => void
  setPreviewHeadOid: (oid: string | null) => void
}

export const useTimelineNavStore = create<TimelineNavState>((set) => ({
  isOpen: false,
  repoPath: null,
  previewIndex: 0,
  previewHeadOid: null,
  open: (repoPath, startIndex) =>
    set({ isOpen: true, repoPath, previewIndex: startIndex, previewHeadOid: null }),
  close: () => set({ isOpen: false, repoPath: null, previewHeadOid: null }),
  setPreviewIndex: (index) => set({ previewIndex: index }),
  setPreviewHeadOid: (oid) => set({ previewHeadOid: oid }),
}))
