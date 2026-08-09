import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from '@git-manager/i18n'
import type { BoardCard, BoardColumn, BoardTag } from '@git-manager/git-types'
import { Badge, Button } from '@git-manager/ui'
import { Check, Plus } from 'lucide-react'
import { BoardCardView, type CardActions } from './BoardCardView'
import { ColumnActionsMenu, type ColumnActions } from './ColumnActionsMenu'

interface BoardColumnViewProps {
  column: BoardColumn
  cards: BoardCard[]
  /** Omitted for a closed sprint, which hides the add button entirely rather than disabling it. */
  onAddCard?: () => void
  onCardClick: (card: BoardCard) => void
  addCardLabel: string
  /** The board's tag palette, so each card can paint the tags it references by id. */
  tags?: BoardTag[]
  cardActionsFor?: (card: BoardCard) => CardActions | undefined
  /** Resolves an assignee's picture — see `BoardCardView`. */
  avatarUrlFor?: (assignee: string) => string | undefined
  /** The column-wide actions — omitted for a closed sprint, like `onAddCard`. */
  columnActions?: ColumnActions
}

/**
 * One column: a `useDroppable` target (so an empty column still accepts a drop) wrapping a
 * `SortableContext` of its cards' ids — see `BoardColumnsArea`'s `DndContext` for the drag
 * resolution.
 *
 * A flat track with no border of its own, so the cards' borders and shadows are what the eye
 * separates; the header is a quiet uppercase label rather than a titled panel, since the column's
 * name is a *state* the cards are in and not a heading they belong under. The count is an outlined
 * `Badge` and not a `NumberBadge`: that component is a filled accent pill for something demanding
 * attention, and "six cards" is a fact, not a notification — the outline gives it an edge to be read
 * as a count against the label beside it, without the weight of a fill.
 *
 * The track is `--muted` at half opacity, so it settles between `--muted` and `--background` — which
 * is exactly the gap the cards' own `bg-background` opens against it. See the note on
 * `BoardCardView`'s surface for why the card is not on `--card`, and what must not be "fixed" back.
 */
export function BoardColumnView({
  column,
  cards,
  onAddCard,
  onCardClick,
  addCardLabel,
  tags,
  cardActionsFor,
  avatarUrlFor,
  columnActions,
}: BoardColumnViewProps) {
  const { t } = useTranslation('board')
  // `isOver` is what turns the column into a visible drop target — without it a drag gives no clue
  // where the card would land, which on an empty column is indistinguishable from "you can't drop
  // here".
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      className={`group/column flex h-full w-[340px] shrink-0 flex-col rounded-md transition-colors ${
        isOver ? 'bg-primary/10 ring-1 ring-primary' : 'bg-muted/50'
      }`}
      data-droppable-over={isOver ? 'true' : undefined}
      data-testid={`board-column-${column.id}`}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2.5">
        {column.color && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: column.color }}
          />
        )}
        <span className="min-w-0 truncate text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {column.name}
        </span>
        {/* The column that means "finished" says so, rather than leaving it to whoever named it. */}
        {column.isDone && (
          <Check
            className="h-3.5 w-3.5 shrink-0 text-tone-success"
            aria-label={t('columnEditor.isDone')}
            data-testid={`board-column-${column.id}-done`}
          />
        )}
        {/* Outlined rather than filled: the count sits next to the column's own name, and a solid
            chip there would out-shout the label it belongs to. Kept visible at zero — an empty column
            saying "0" is a state, where a vanished badge reads as a header still loading. */}
        <Badge
          variant="outline"
          className="shrink-0 px-1.5 py-0 text-[11px] leading-[16px] font-medium text-muted-foreground tabular-nums"
          data-testid={`board-column-${column.id}-count`}
        >
          {cards.length}
        </Badge>
        {onAddCard && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6"
            onClick={onAddCard}
            title={addCardLabel}
            data-testid={`board-column-${column.id}-add-card`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
        {/* `ml-auto` only when the add button isn't there to carry it — a closed sprint has neither,
            and the menu would otherwise sit against the count. */}
        <div className={onAddCard ? '' : 'ml-auto'}>
          <ColumnActionsMenu
            {...columnActions}
            cardCount={cards.length}
            testId={`board-column-${column.id}-menu`}
          />
        </div>
      </div>

      <div ref={setNodeRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <BoardCardView
              key={card.id}
              card={card}
              tags={tags}
              actions={cardActionsFor?.(card)}
              avatarUrlFor={avatarUrlFor}
              onClick={() => onCardClick(card)}
            />
          ))}
        </SortableContext>

        {/* An empty column has nothing to hover over, so the invitation has to be drawn. It also
            gives the droppable area real height — a zero-height target cannot be dropped on. */}
        {cards.length === 0 && (
          <div
            data-testid={`board-column-${column.id}-empty`}
            className={`flex h-20 items-center justify-center rounded-md border border-dashed text-[11px] transition-colors ${
              isOver
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground/60'
            }`}
          >
            {isOver ? t('column.dropHere') : t('column.empty')}
          </div>
        )}
      </div>
    </div>
  )
}
