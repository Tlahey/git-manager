import { create } from 'zustand'
import type { GitRef } from '@git-manager/git-types'

/**
 * Tracks the ref badge currently being dragged in the commit graph (branch/tag drag-and-drop).
 *
 * The HTML5 drag payload (`dataTransfer`) is unreadable during `dragover`/`dragenter` for
 * security, so a drop target can't inspect the source there. This store mirrors the source ref
 * so a target can decide, mid-drag, whether the drop is valid (our ref, and a *different* ref)
 * and show the green "+" copy cursor accordingly. Cleared on `dragend`.
 */
interface RefDragState {
  draggingRef: GitRef | null
  /**
   * The ref currently highlighted as the drop target. It's *sticky*: once the drag enters a valid
   * target it stays set — even after the cursor leaves that badge — until the drag enters a
   * different target or ends. That keeps the target's full name + its highlighted commits on screen
   * while the user aims, matching the expected drop UX.
   */
  hoverRef: GitRef | null
  startDrag: (ref: GitRef) => void
  setHoverRef: (ref: GitRef | null) => void
  endDrag: () => void
}

export const useRefDragStore = create<RefDragState>((set) => ({
  draggingRef: null,
  hoverRef: null,
  startDrag: (ref) => set({ draggingRef: ref }),
  setHoverRef: (ref) => set({ hoverRef: ref }),
  endDrag: () => set({ draggingRef: null, hoverRef: null }),
}))

/** True when `ref` is the same ref as `other` (same name + type). */
export function isSameRef(a: GitRef | null, b: GitRef | null): boolean {
  if (!a || !b) return false
  return a.name === b.name && a.type === b.type
}

/** True when `target` is a valid drop destination for the currently-dragged ref: a real drag is
 *  in progress and the target is a *different* ref (dropping a ref on itself is a no-op). */
export function isValidRefDropTarget(dragging: GitRef | null, target: GitRef): boolean {
  if (!dragging) return false
  return dragging.name !== target.name || dragging.type !== target.type
}
