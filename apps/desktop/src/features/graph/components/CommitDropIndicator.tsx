import { cn } from '@git-manager/ui'

/**
 * The mark a graph row wears while it is the live drop target of a commit drag: a full-width line
 * on the edge the commits would slide into, or a ring around the row they would fold into.
 *
 * Purely presentational — `useCommitRowDrag` decides which of the two (if either) the row is.
 */
export function CommitDropIndicator({
  indicator,
}: {
  indicator: 'gap-above' | 'gap-below' | 'combine' | null
}) {
  if (!indicator) return null

  if (indicator === 'combine') {
    return (
      <span
        aria-hidden
        data-testid="commit-drop-combine"
        className="pointer-events-none absolute inset-0 z-graph-row-hover rounded-sm ring-2 ring-primary ring-inset"
      />
    )
  }

  // The line sits on the slot's own boundary — the middle of the 8px gap two rows' margins leave
  // between them — so it reads as the space *between* two commits rather than as a border
  // belonging to either of them.
  return (
    <span
      aria-hidden
      data-testid={`commit-drop-${indicator}`}
      className={cn(
        'pointer-events-none absolute inset-x-0 z-graph-row-hover h-[2px] rounded-full bg-primary',
        indicator === 'gap-above' ? 'top-0' : 'bottom-0'
      )}
    />
  )
}
