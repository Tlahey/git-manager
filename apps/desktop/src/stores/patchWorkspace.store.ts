import { create } from 'zustand'

export type PatchMode = 'create' | 'apply' | 'dependency'

/** The file currently shown in the center 2-pane diff. */
export interface PatchActiveFile {
  path: string
  /**
   * Pre-computed diff sides. Set for apply/dependency patches (reconstructed from
   * the patch text, since the "after" state isn't on disk). Left undefined for
   * `create`, where the center fetches the real working-tree contents itself.
   */
  original?: string
  modified?: string
}

/**
 * Drives the in-layout patch workspace, which reuses the git-graph's two-pane
 * shell: the right panel lists the patch's files (via `CommitFileList`), the
 * center shows the selected file's diff (via the Monaco two-pane `ThreeWayMergeEditor`).
 * Only the cross-slot state lives here — `mode` (which panel + center to show)
 * and `activeFile` (the file the center renders). Panels own their own state.
 */
interface PatchWorkspaceState {
  mode: PatchMode | null
  activeFile: PatchActiveFile | null
  open: (mode: PatchMode) => void
  close: () => void
  setActiveFile: (file: PatchActiveFile | null) => void
}

export const usePatchWorkspaceStore = create<PatchWorkspaceState>((set) => ({
  mode: null,
  activeFile: null,
  open: (mode) => set({ mode, activeFile: null }),
  close: () => set({ mode: null, activeFile: null }),
  setActiveFile: (file) => set({ activeFile: file }),
}))
