import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@git-manager/ui'

interface CardFieldRowProps {
  label: string
  testId: string
  /**
   * The choices this field offers, shown against the value the moment it is clicked.
   *
   * Omitted on a closed sprint, and on a field that edits in place — a row with no editor renders as
   * plain text and never lights up.
   */
  editor?: ReactNode
  /** Whether the editor is showing. Controlled by the panel, which closes it once a choice lands. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
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
  /** How wide the choices are, when a list of names needs more room than a list of words. */
  editorClassName?: string
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
 * all.
 *
 * **Clicking it shows the choices themselves, over the value, the way `CardStatusPicker` does.** The
 * editor used to open *under* the row, which made every edit two gestures against a moving panel:
 * the row grew, everything below it slid down, and the control that appeared — a native select, a
 * bare date input — was a second thing to operate before the value changed. Anchored here, the list
 * of possible values *is* the click's answer, one more click sets it, and the rows either side of
 * the one being edited stay where the eye left them.
 */
export function CardFieldRow({
  label,
  testId,
  editor,
  open,
  onOpenChange,
  editTitle,
  addLabel,
  filled = true,
  children,
  editorClassName = 'w-60',
}: CardFieldRowProps) {
  const value = filled ? (
    children
  ) : (
    <span className="text-[11px] text-muted-foreground italic">{addLabel}</span>
  )

  return (
    <div data-testid={testId} className="px-3 py-1.5">
      <div className="flex min-h-6 items-start gap-2">
        <span className="w-20 shrink-0 pt-0.5 text-[11px] text-muted-foreground">{label}</span>
        {editor ? (
          <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={editTitle}
                aria-label={editTitle}
                data-testid={`${testId}-edit`}
                className="-mx-1 min-w-0 flex-1 cursor-pointer rounded px-1 py-0.5 text-left hover:bg-accent"
              >
                {value}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className={`p-1 ${editorClassName}`}
              data-testid={`${testId}-editor`}
            >
              {editor}
            </PopoverContent>
          </Popover>
        ) : (
          <div className="min-w-0 flex-1">{value}</div>
        )}
      </div>
    </div>
  )
}
