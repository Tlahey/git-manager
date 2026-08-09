import { createContext, useContext, useEffect, useState } from 'react'
import {
  COMMIT_DRAG_MIME,
  dropIndicatorFor,
  useCommitDragStore,
} from '../stores/commitDrag.store'
import { useRefDragStore } from '../stores/refDrag.store'
import { isSyntheticRow } from '../lib/syntheticRows'
import { resolveDropTarget, type CommitDropTarget } from '../lib/commitReorder'

/**
 * Wiring shared by every graph row that takes part in commit drag-and-drop. The context object and
 * this hook live here rather than next to the provider component so that file exports a component
 * alone — a module mixing the two loses Vite's Fast Refresh (`react/only-export-components`).
 */
export interface CommitDragContextValue {
  /** Commits that may be dragged, and dropped on — HEAD's linear first-parent window. */
  reorderable: Set<string>
  /** The graph's current multi-selection: grabbing one of these drags the whole group. */
  selectedOids: Set<string>
  /** Label for the drag ghost, e.g. "3 commits" — resolved by the provider so this stays i18n-free. */
  dragLabel: (count: number) => string
  onDrop: (target: CommitDropTarget, sourceOids: string[]) => void
}

export const CommitDragContext = createContext<CommitDragContextValue | null>(null)

/** DOM props the row's slot spreads onto itself to become a drag source and a drop target. */
export interface CommitRowDragProps {
  draggable: boolean
  onMouseDown: (event: React.MouseEvent) => void
  onDragStart: (event: React.DragEvent) => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent) => void
  onDragEnd: () => void
}

export interface CommitRowDragState {
  /** `null` outside a provider (tests, Storybook) — drag disabled entirely. */
  rowProps: CommitRowDragProps | null
  /** This row is one of the commits in flight — drawn faded. */
  isDragging: boolean
  /** How this row should be decorated as the current drop target. */
  indicator: 'gap-above' | 'gap-below' | 'combine' | null
}

/** Floating ghost that follows the cursor, since WKWebView's default snapshot of a full-width,
 * mostly-transparent row is unreadable. Removed on the next frame — the browser has taken its
 * bitmap by then, and keeping the node would leave it on screen. */
function makeDragImage(event: React.DragEvent, label: string) {
  if (typeof event.dataTransfer.setDragImage !== 'function') return
  const ghost = document.createElement('div')
  ghost.textContent = label
  ghost.style.cssText = [
    'position:fixed',
    'top:-1000px',
    'left:-1000px',
    'padding:4px 10px',
    'border-radius:6px',
    'font-size:11px',
    'font-weight:600',
    'white-space:nowrap',
    'pointer-events:none',
    'background:hsl(var(--primary))',
    'color:hsl(var(--primary-foreground))',
  ].join(';')
  document.body.appendChild(ghost)
  event.dataTransfer.setDragImage(ghost, 12, 12)
  requestAnimationFrame(() => ghost.remove())
}

/**
 * Everything a commit row's *slot* needs to be dragged and dropped on.
 *
 * It is deliberately the slot — the full-height element the virtualizer positions — and not the
 * `GraphRow` inside it: the row is 8px shorter than its slot (`my-[4px]`), and that margin is
 * exactly the visual gap between two commits, i.e. where the cursor sits when the user means "put
 * it here". Handlers on the row alone left that band inert, so an insertion between two rows
 * silently did nothing. See {@link ./components/CommitDragSlot CommitDragSlot}.
 */
export function useCommitRowDrag(oid: string): CommitRowDragState {
  const context = useContext(CommitDragContext)
  const startDrag = useCommitDragStore((s) => s.startDrag)
  const setDropTarget = useCommitDragStore((s) => s.setDropTarget)
  const endDrag = useCommitDragStore((s) => s.endDrag)
  const isDragging = useCommitDragStore((s) => s.draggingOids.includes(oid))
  const indicator = useCommitDragStore((s) => dropIndicatorFor(s.dropTarget, oid))

  // WKWebView does not deliver `contextmenu` to a permanently-`draggable` element, and the graph
  // row's right-click menu is its main entry point for commit actions. So the row is inert until
  // the left button goes down — the only window in which a native HTML5 drag can start anyway.
  // Same trick, and the same reason, as `RefLabel`'s badges.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const disarm = () => setArmed(false)
    window.addEventListener('mouseup', disarm)
    return () => window.removeEventListener('mouseup', disarm)
  }, [armed])

  if (!context) return { rowProps: null, isDragging: false, indicator: null }

  const canDrag = context.reorderable.has(oid) && !isSyntheticRow(oid)

  const rowProps: CommitRowDragProps = {
    draggable: canDrag && armed,
    onMouseDown: (event) => {
      if (event.button === 0 && canDrag) setArmed(true)
    },
    onDragStart: (event) => {
      // A ref badge is a draggable descendant of the row: the browser picks it as the source, so
      // this shouldn't fire — but a ref drag reaching here would submit a commit rebase instead.
      if (useRefDragStore.getState().draggingRef) return
      // Grabbing a row inside the selection moves the whole group; grabbing one outside it moves
      // that row alone, matching how a file manager treats a drag on an unselected item.
      const group = context.selectedOids.has(oid)
        ? [...context.selectedOids].filter((o) => !isSyntheticRow(o))
        : [oid]
      startDrag(group)
      event.dataTransfer.setData(COMMIT_DRAG_MIME, group.join(','))
      event.dataTransfer.effectAllowed = 'move'
      makeDragImage(event, context.dragLabel(group.length))
    },
    onDragOver: (event) => {
      if (!event.dataTransfer.types.includes(COMMIT_DRAG_MIME)) return
      if (!context.reorderable.has(oid)) {
        // Still swallow the event: letting it fall through would leave the previous row's
        // indicator up while the cursor sits somewhere the drop can't happen.
        event.preventDefault()
        event.dataTransfer.dropEffect = 'none'
        setDropTarget(null)
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const rect = event.currentTarget.getBoundingClientRect()
      const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
      setDropTarget(resolveDropTarget(oid, Math.min(1, Math.max(0, ratio))))
    },
    onDrop: (event) => {
      if (!event.dataTransfer.types.includes(COMMIT_DRAG_MIME)) return
      event.preventDefault()
      event.stopPropagation()
      const { dropTarget, draggingOids } = useCommitDragStore.getState()
      endDrag()
      setArmed(false)
      if (dropTarget) context.onDrop(dropTarget, draggingOids)
    },
    onDragEnd: () => {
      endDrag()
      setArmed(false)
    },
  }

  return { rowProps, isDragging, indicator }
}
