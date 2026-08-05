import { create } from 'zustand'
import type { CommitDropTarget } from '../components/git-graph/commitReorder'

/**
 * Live state of a commit drag in the graph — which commits are in flight and where they'd land.
 *
 * It exists for the same reason as {@link ../stores/refDrag.store refDrag.store}: the HTML5 drag
 * payload (`dataTransfer`) is unreadable during `dragover`, so a row can't tell what is being
 * dragged over it from the event alone. Mirroring the drag here lets every row decide, on each
 * `dragover`, whether it is a valid target and draw the right indicator — and lets the dragged
 * rows fade themselves out.
 *
 * The state is deliberately *not* held in the graph component: `GraphRow` is memoised and the
 * indicator has to repaint on every pointer move, so a store subscription (which re-renders only
 * the rows whose selected slice actually changed) is what keeps a drag from re-rendering the
 * whole virtualized list on each frame.
 */
interface CommitDragState {
  /** Commits being dragged, newest first; empty when no drag is in progress. */
  draggingOids: string[]
  /** Where the drag would land, or `null` while it is over no valid target. */
  dropTarget: CommitDropTarget | null
  startDrag: (oids: string[]) => void
  setDropTarget: (target: CommitDropTarget | null) => void
  endDrag: () => void
}

export const useCommitDragStore = create<CommitDragState>((set) => ({
  draggingOids: [],
  dropTarget: null,
  startDrag: (oids) => set({ draggingOids: oids, dropTarget: null }),
  setDropTarget: (target) => set({ dropTarget: target }),
  endDrag: () => set({ draggingOids: [], dropTarget: null }),
}))

/** MIME type marking a graph drag as ours, so a row can accept the drop in `dragover` — where the
 * payload itself is unreadable and only the type list can be inspected. */
export const COMMIT_DRAG_MIME = 'application/x-gm-commits'

/** How `target` should be drawn on the row `oid`: a gap line, a combine ring, or nothing. */
export function dropIndicatorFor(
  target: CommitDropTarget | null,
  oid: string
): 'gap-above' | 'gap-below' | 'combine' | null {
  if (!target || target.oid !== oid) return null
  if (target.kind === 'combine') return 'combine'
  return target.edge === 'above' ? 'gap-above' : 'gap-below'
}
