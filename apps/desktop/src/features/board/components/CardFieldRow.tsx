import type { ReactNode } from 'react'

interface CardFieldRowProps {
  label: string
  testId: string
  /** Opens this field's editor. Omitted on a closed sprint, or on a field that edits in place. */
  onEdit?: () => void
  editTitle?: string
  /**
   * What to offer when the field holds nothing — "Add a due date" rather than "No due date".
   *
   * An empty field is an invitation, not a fact: the value column is the only place the user can
   * click, so a greyed statement there leaves them nothing to aim at. Set alongside `children`,
   * which is then only rendered when the field *has* a value.
   */
  addLabel?: string
  /** Whether the field currently holds a value; drives `addLabel` vs `children`. */
  filled?: boolean
  children?: ReactNode
  /** The field's own editor, rendered under the row across the full width. */
  editor?: ReactNode
}

/**
 * One field of the card's side panel: its name on the left, its value on the right.
 *
 * Two columns rather than a caption above the value — a card carries a dozen small fields, and
 * stacked captions turn that into a column of headings with the answers hiding between them. The
 * label column is fixed so every value starts on the same line, which is what makes the panel
 * scannable rather than merely compact.
 *
 * The whole value cell is the target when the field is editable, rather than a pencil beside it: a
 * small button that only appears on hover is a control the user has to discover, whereas "click the
 * thing you want to change" needs no teaching. The cell's hover fill is what says it is editable at
 * all — a field with no `onEdit` renders as plain text and never lights up.
 */
export function CardFieldRow({
  label,
  testId,
  onEdit,
  editTitle,
  addLabel,
  filled = true,
  children,
  editor,
}: CardFieldRowProps) {
  const value = filled ? (
    children
  ) : (
    <span className="text-[11px] italic text-muted-foreground">{addLabel}</span>
  )

  return (
    <div data-testid={testId} className="px-3 py-1.5">
      <div className="flex min-h-6 items-start gap-2">
        <span className="w-20 shrink-0 pt-0.5 text-[11px] text-muted-foreground">{label}</span>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            title={editTitle}
            data-testid={`${testId}-edit`}
            className="-mx-1 min-w-0 flex-1 cursor-pointer rounded px-1 py-0.5 text-left hover:bg-accent"
          >
            {value}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{value}</div>
        )}
      </div>
      {editor}
    </div>
  )
}
