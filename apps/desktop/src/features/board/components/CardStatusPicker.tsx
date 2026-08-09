import { useTranslation } from '@git-manager/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@git-manager/ui'
import { Check, ChevronDown } from 'lucide-react'
import type { BoardColumn } from '@git-manager/git-types'

interface CardStatusPickerProps {
  columns: BoardColumn[]
  columnId: string
  onChange: (columnId: string) => Promise<unknown>
  /** A closed sprint's cards are readable but not movable. */
  readOnly?: boolean
}

/**
 * The card's column, as a menu — the same move a drag performs, from inside the card.
 *
 * Dragging was the only way to change a column, which meant closing the card, finding it again in
 * its column and dragging it: three steps to say the one thing the card is most often opened to say.
 *
 * It writes `columnId` and nothing else. The card keeps its `order`, so it lands among the target
 * column's cards wherever that number puts it rather than at the top — a move made from here is a
 * statement about *state*, not about priority, and silently reordering the target column would be a
 * second, unasked-for edit.
 */
export function CardStatusPicker({ columns, columnId, onChange, readOnly }: CardStatusPickerProps) {
  const { t } = useTranslation('board')
  const ordered = [...columns].sort((a, b) => a.order - b.order)
  const current = ordered.find((c) => c.id === columnId)
  const label = current?.name ?? t('card.status.unknown')

  if (readOnly) {
    return (
      <span
        data-testid="card-status-readonly"
        className="inline-flex items-center rounded bg-muted px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t('card.status.label')}
          aria-label={t('card.status.label')}
          data-testid="card-status-picker"
          className="inline-flex cursor-pointer items-center gap-1 rounded bg-muted px-2 py-1 text-[11px] font-semibold tracking-wide text-foreground uppercase transition-colors hover:bg-accent"
        >
          {label}
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {ordered.map((column) => (
          <DropdownMenuItem
            key={column.id}
            className="gap-2 text-xs"
            onSelect={() => void onChange(column.id)}
            data-testid={`card-status-option-${column.id}`}
          >
            {column.color && (
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: column.color }}
              />
            )}
            <span className="min-w-0 flex-1 truncate">{column.name}</span>
            {column.id === columnId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
