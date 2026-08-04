import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from '@git-manager/i18n'
import type { BoardCard, BoardColumn, BoardTag } from '@git-manager/git-types'
import { Button, NumberBadge } from '@git-manager/ui'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { BoardCardView, type CardActions } from './BoardCardView'

interface BoardColumnViewProps {
  column: BoardColumn
  cards: BoardCard[]
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Omitted for a closed sprint, which hides the add button entirely rather than disabling it. */
  onAddCard?: () => void
  onCardClick: (card: BoardCard) => void
  addCardLabel: string
  /** The board's tag palette, so each card can paint the tags it references by id. */
  tags?: BoardTag[]
  cardActionsFor?: (card: BoardCard) => CardActions | undefined
}

/** One column: a `useDroppable` target (so an empty column still accepts a drop) wrapping a
 * `SortableContext` of its cards' ids — see `BoardPage`'s `DndContext` for the drag resolution. */
export function BoardColumnView({
  column,
  cards,
  collapsed,
  onToggleCollapsed,
  onAddCard,
  onCardClick,
  addCardLabel,
  tags,
  cardActionsFor,
}: BoardColumnViewProps) {
  const { t } = useTranslation('board')
  // `isOver` is what turns the column into a visible drop target — without it a drag gives no clue
  // where the card would land, which on an empty column is indistinguishable from "you can't drop
  // here".
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      className={`flex h-full w-72 shrink-0 flex-col rounded-lg border bg-card/30 transition-colors ${
        isOver ? 'border-primary bg-primary/5' : 'border-border'
      }`}
      data-droppable-over={isOver ? 'true' : undefined}
      data-testid={`board-column-${column.id}`}
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2.5 py-2">
        <button
          onClick={onToggleCollapsed}
          className="flex cursor-pointer items-center gap-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          data-testid={`board-column-${column.id}-toggle`}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {column.color && (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {column.name}
        </span>
        <NumberBadge count={cards.length} hideZero={false} />
        {onAddCard && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onAddCard}
            title={addCardLabel}
            data-testid={`board-column-${column.id}-add-card`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {!collapsed && (
        <div ref={setNodeRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {cards.map((card) => (
              <BoardCardView
                key={card.id}
                card={card}
                tags={tags}
                actions={cardActionsFor?.(card)}
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
      )}
    </div>
  )
}
