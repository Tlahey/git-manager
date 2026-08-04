import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from '@git-manager/i18n'
import type { BoardCard, BoardTag } from '@git-manager/git-types'
import { Card, Tooltip } from '@git-manager/ui'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  GitBranch,
  ListChecks,
  MessageSquare,
} from 'lucide-react'
import {
  cardIdentifier,
  dodProgress,
  isOverdue,
  resolveCardTags,
  tagStripeBackground,
} from '../cardMeta'
import { CardPriorityIcon } from './CardPriorityIcon'
import { CardActionsMenu } from './CardActionsMenu'

interface BoardCardViewProps {
  card: BoardCard
  onClick: () => void
  /** The board's palette, so the card can paint its tags. Omitted in the drag overlay preview. */
  tags?: BoardTag[]
  /** The same whole-card actions the dialog offers, reachable without opening it. */
  actions?: CardActions
}

export interface CardActions {
  onDuplicate?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete?: () => void
}

/** One draggable card in a `BoardColumnView`'s `SortableContext` — see `BoardPage`'s `DndContext` for
 * how a drag resolves to a `moveCard` call. */
export function BoardCardView({
  card,
  onClick,
  tags = [],
  actions,
}: BoardCardViewProps) {
  const { t } = useTranslation('board')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const cardTags = resolveCardTags({ tags }, card)
  const stripe = tagStripeBackground(cardTags)
  const dod = dodProgress(card.dod)
  const overdue = isOverdue(card.dueDate)
  const identifier = cardIdentifier(card)

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        onClick={onClick}
        data-testid={`board-card-${card.id}`}
        className={`group relative cursor-pointer space-y-1.5 p-2.5 pl-3 text-xs transition-colors hover:border-primary/40 ${
          card.blockedReason ? 'border-destructive/50' : ''
        } ${card.archivedAt ? 'opacity-60' : ''}`}
      >
        {/* The tag stripe: one solid colour, or equal hard-edged bands in board-tag order. */}
        {stripe && (
          <span
            aria-hidden
            data-testid="board-card-tag-stripe"
            className="absolute inset-y-0 left-0 w-[3px] rounded-l"
            style={{ background: stripe }}
          />
        )}

        <div className="flex items-start gap-1.5">
          {card.blockedReason && (
            <Tooltip content={card.blockedReason}>
              <AlertTriangle
                className="mt-0.5 h-3 w-3 shrink-0 text-destructive"
                data-testid="board-card-blocked"
                aria-label={t('card.blocked.label')}
              />
            </Tooltip>
          )}
          <p className="line-clamp-2 flex-1 font-medium text-foreground">{card.title}</p>
          <CardPriorityIcon priority={card.priority} className="shrink-0" />
          {actions && <CardActionsMenu {...actions} compact />}
        </div>

        {(identifier || card.archivedAt || card.sourceIssue) && (
          <span className="flex items-center gap-1.5">
            {identifier && (
              <span
                data-testid="board-card-identifier"
                className="font-mono text-[10px] text-muted-foreground"
              >
                {identifier}
              </span>
            )}
            {/* A tracked card carries two numbers — the board's own identifier and the issue's — and
                they are not interchangeable, so both are shown rather than one standing in for the
                other. The icon colour is the issue's state. */}
            {card.sourceIssue && (
              <Tooltip
                content={t(
                  card.issueState === undefined
                    ? 'card.tracking.unreachable'
                    : `card.tracking.${card.issueState}`
                )}
              >
                <span
                  data-testid="board-card-tracked"
                  className="flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {card.issueState === 'closed' ? (
                    <CheckCircle2 className="h-3 w-3 text-tone-info" />
                  ) : (
                    <CircleDot
                      className={`h-3 w-3 ${
                        card.issueState === 'open' ? 'text-tone-success' : 'text-muted-foreground'
                      }`}
                    />
                  )}
                  #{card.sourceIssue.number}
                </span>
              </Tooltip>
            )}
            {card.archivedAt && (
              <span
                data-testid="board-card-archived"
                className="rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground"
              >
                {t('card.archivedBadge')}
              </span>
            )}
          </span>
        )}

        {card.description && (
          <p className="line-clamp-2 text-[11px] text-muted-foreground">{card.description}</p>
        )}

        {cardTags.length > 0 && (
          <div className="flex flex-wrap gap-1" data-testid="board-card-tags">
            {cardTags.map((tag) => (
              <span
                key={tag.id}
                data-testid={`board-card-tag-${tag.id}`}
                className="rounded-full px-1.5 py-px text-[9px]"
                style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {(dod.total > 0 || card.dueDate || card.assignee || card.comments.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            {dod.total > 0 && (
              <span className="flex items-center gap-0.5" data-testid="board-card-dod">
                <ListChecks className="h-3 w-3" />
                {t('card.dod.progress', { done: dod.done, total: dod.total })}
              </span>
            )}
            {card.dueDate && (
              <span
                className={`flex items-center gap-0.5 ${overdue ? 'font-medium text-destructive' : ''}`}
                data-testid={overdue ? 'board-card-due-overdue' : 'board-card-due'}
              >
                <CalendarClock className="h-3 w-3" />
                {card.dueDate}
              </span>
            )}
            {card.comments.length > 0 && (
              <span className="flex items-center gap-0.5" data-testid="board-card-comments">
                <MessageSquare className="h-3 w-3" />
                {card.comments.length}
              </span>
            )}
            {card.assignee && (
              <span className="ml-auto truncate font-medium" data-testid="board-card-assignee">
                {card.assignee}
              </span>
            )}
          </div>
        )}

        {card.linkedBranch && (
          <span className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
            <GitBranch className="h-3 w-3 shrink-0" /> {card.linkedBranch}
          </span>
        )}
      </Card>
    </div>
  )
}
