import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@git-manager/ui'
import { useCommitRowDrag } from '../useCommitRowDrag'
import { CommitDropIndicator } from './CommitDropIndicator'

interface CommitDragSlotProps {
  oid: string
  /** The virtualizer's own positioning (absolute + translateY) and preview-collapse transform. */
  style: CSSProperties
  className?: string
  testId: string
  selected: boolean
  children: ReactNode
}

/**
 * The full-height slot the virtualizer positions for one commit — and the element that carries the
 * commit drag-and-drop handlers.
 *
 * The drag surface has to be *this* element rather than the `GraphRow` it wraps. The row is 8px
 * shorter than its slot (`my-[4px]`), and that margin is precisely the visual gap between two
 * commits: aim there to insert a commit between two others and, with the handlers on the row, no
 * `dragover` fires, so the drop is never allowed and releasing does nothing at all. Slots tile the
 * list with no dead space, so every pixel of the graph resolves to a drop target.
 *
 * That also puts the gap indicator on the slot boundary — the middle of the visual gap — instead of
 * inside one row's margin.
 */
export function CommitDragSlot({
  oid,
  style,
  className,
  testId,
  selected,
  children,
}: CommitDragSlotProps) {
  const { rowProps, isDragging, indicator } = useCommitRowDrag(oid)

  return (
    <div
      data-testid={testId}
      data-selected={selected}
      className={cn(className, isDragging && 'opacity-40')}
      style={style}
      {...rowProps}
    >
      <CommitDropIndicator indicator={indicator} />
      {children}
    </div>
  )
}
