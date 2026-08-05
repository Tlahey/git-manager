import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useTranslation } from '@git-manager/i18n'
import type { Board, BoardCard } from '@git-manager/git-types'
import { useBoardStore } from '../stores/board.store'
import { BoardColumnView } from './BoardColumnView'
import { BoardCardView, type CardActions } from './BoardCardView'

interface BoardColumnsAreaProps {
  board: Board
  cards: BoardCard[]
  onAddCard: (columnId: string) => void
  onCardClick: (card: BoardCard) => void
  onMoveCard: (card: BoardCard, columnId: string, order: number) => void
  /** Per-card whole-card actions, shown in each card's own `⋯` menu. */
  cardActionsFor?: (card: BoardCard) => CardActions | undefined
  /** A closed sprint is readable but not editable. */
  readOnly?: boolean
  /** Resolves an assignee's picture — see `useBoardAssigneeAvatars`. */
  avatarUrlFor?: (assignee: string) => string | undefined
}

/**
 * The columns themselves, and the drag that moves cards between them.
 *
 * Split out of `BoardPage` with the drag handlers it owns: resolving a drop is the only reason that
 * page ever knew about `@dnd-kit`, and it had grown past the one-responsibility line.
 *
 * On a **closed** sprint no `DndContext` is mounted at all, rather than a drag being accepted and
 * then refused — nothing lifts, which is a clearer statement than a card that snaps back.
 */
export function BoardColumnsArea({
  board,
  cards,
  onAddCard,
  onCardClick,
  onMoveCard,
  cardActionsFor,
  readOnly,
  avatarUrlFor,
}: BoardColumnsAreaProps) {
  const { t } = useTranslation('board')
  const isColumnCollapsed = useBoardStore((s) => s.isColumnCollapsed)
  const toggleColumnCollapsed = useBoardStore((s) => s.toggleColumnCollapsed)
  const [activeDragCard, setActiveDragCard] = useState<BoardCard | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, BoardCard[]>()
    for (const column of board.columns) map.set(column.id, [])
    for (const card of cards) map.get(card.columnId)?.push(card)
    for (const list of map.values()) list.sort((a, b) => a.order - b.order)
    return map
  }, [board.columns, cards])

  const orderedColumns = useMemo(
    () => [...board.columns].sort((a, b) => a.order - b.order),
    [board.columns]
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveDragCard(cards.find((c) => c.id === String(event.active.id)) ?? null)
  }

  /**
   * Resolves a drop to a target column + position: dropping directly on a column (its droppable
   * area, e.g. empty space) targets the end of that column; dropping on another card targets that
   * card's index within its column. A same-position drop is a no-op, not a wasted mutation.
   */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDragCard(null)
    if (!over) return

    const card = cards.find((c) => c.id === String(active.id))
    if (!card) return

    const overId = String(over.id)
    const overColumn = board.columns.find((c) => c.id === overId)
    const overCard = overColumn ? null : cards.find((c) => c.id === overId)
    const targetColumnId = overColumn?.id ?? overCard?.columnId
    if (!targetColumnId) return

    const targetCards = (cardsByColumn.get(targetColumnId) ?? []).filter((c) => c.id !== card.id)
    const overIndex = overCard ? targetCards.findIndex((c) => c.id === overCard.id) : -1
    const order = overIndex === -1 ? targetCards.length : overIndex

    if (targetColumnId === card.columnId && order === card.order) return
    onMoveCard(card, targetColumnId, order)
  }

  const columns = (
    // `items-stretch` + a min-height of zero is what gives each column the full remaining height, so
    // a long list scrolls inside its own track rather than growing the page.
    <div className="flex min-h-0 flex-1 items-stretch gap-2 overflow-x-auto pb-1">
      {orderedColumns.map((column) => (
        <BoardColumnView
          key={column.id}
          column={column}
          cards={cardsByColumn.get(column.id) ?? []}
          collapsed={isColumnCollapsed(board.id, column.id)}
          onToggleCollapsed={() => toggleColumnCollapsed(board.id, column.id)}
          onAddCard={readOnly ? undefined : () => onAddCard(column.id)}
          onCardClick={onCardClick}
          addCardLabel={t('page.addCard')}
          tags={board.tags}
          cardActionsFor={cardActionsFor}
          avatarUrlFor={avatarUrlFor}
        />
      ))}
    </div>
  )

  if (readOnly) return columns

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {columns}
      <DragOverlay>
        {activeDragCard && (
          <BoardCardView
            card={activeDragCard}
            tags={board.tags}
            avatarUrlFor={avatarUrlFor}
            onClick={() => {}}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
