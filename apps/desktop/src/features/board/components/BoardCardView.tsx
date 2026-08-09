import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from '@git-manager/i18n'
import type { BoardCard, BoardTag } from '@git-manager/git-types'
import { Card, Tooltip } from '@git-manager/ui'
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDot, ListChecks } from 'lucide-react'
import { CommitAvatar } from '../../../components/common/CommitAvatar'
import {
  cardIdentifier,
  dodProgress,
  isOverdue,
  readableTextOn,
  resolveCardTags,
} from '../lib/cardMeta'
import { CardPriorityIcon } from './CardPriorityIcon'
import { CardKindIcon } from './CardKindIcon'
import { cardKindStyle } from './cardKind.config'
import { CardActionsMenu } from './CardActionsMenu'
import { CardArchivedBadge } from './CardArchivedBadge'

interface BoardCardViewProps {
  card: BoardCard
  onClick: () => void
  /** The board's palette, so the card can paint its tags. Omitted in the drag overlay preview. */
  tags?: BoardTag[]
  /** The same whole-card actions the dialog offers, reachable without opening it. */
  actions?: CardActions
  /** Resolves an assignee's picture, when the name happens to be a known GitHub login — see
   * `useBoardAssigneeAvatars`. Without one the avatar falls back to coloured initials. */
  avatarUrlFor?: (assignee: string) => string | undefined
}

export interface CardActions {
  onDuplicate?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  /** Opens the move-to-another-board dialog — see `MoveCardDialog`. */
  onMove?: () => void
  onDelete?: () => void
}

/**
 * One draggable card in a `BoardColumnView`'s `SortableContext` — see `BoardColumnsArea`'s
 * `DndContext` for how a drag resolves to a `moveCard` call.
 *
 * Three bands, in the order the eye needs them: **what the work is** (title, then description),
 * **what it belongs to** (the tag badges), and **how to refer to it and who has it** (the footer —
 * identifier on the left, people and dates on the right). The identifier sits in the footer rather
 * than ahead of the title because the title is what the card is scanned for; the key is what it is
 * quoted by, which happens after you have already found it.
 */
export function BoardCardView({
  card,
  onClick,
  tags = [],
  actions,
  avatarUrlFor,
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
  const dod = dodProgress(card.dod)
  const overdue = isOverdue(card.dueDate)
  const identifier = cardIdentifier(card)
  const hasBadges = cardTags.length > 0 || Boolean(card.archivedAt) || Boolean(card.sourceIssue)

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {/*
        A raised tile on the column's flat track, lifted further on hover — the shadow is what the
        drag then picks up.

        **The fill is `--background`, not `--card`.** In almost every theme this app ships (see
        `packages/theme/src/themes/`) `--card` lands between `--background` and `--muted`, which put
        the tile within a percent or two of the `bg-muted/50` track under it — on `light` and
        `twilight` the "white card on a grey column" was white in name only, and on `dark` the two
        were 2% apart. `--background` is the far end of that scale in both polarities: the lightest
        surface where the track is light, the darkest where it is dark.

        It is not a universal win — `solarized-light` puts `--card` *below* its `--muted`, so that
        theme's cards were already the darker shape and now separate by less. That is the trade, and
        it is the right way round: one theme loses a little contrast where twelve gain it.

        **The border stays regardless.** The separation must never rest on the fill alone — a theme
        is free to close the gap again, and a card is a drop target whose edge has to stay visible
        mid-drag. Border plus shadow delineate it; the fill is the third cue, not the only one.

        **The left edge is the kind's colour** (`cardKind.config.ts`), thickened to 4px. It is the
        one mark on a card that reads without the card being read: down a column of a dozen, the
        bugs are findable before a single title is. It stays the kind's rather than the priority's or
        the tag's — a card has exactly one kind, where it can have no tag or five, and the edge can
        only ever say one thing.

        Its class comes *after* the all-round border colour on purpose: `Card` merges with
        tailwind-merge, which drops a per-side colour when a whole-border colour follows it.
      */}
      <Card
        onClick={onClick}
        data-testid={`board-card-${card.id}`}
        className={`group cursor-pointer space-y-2 border-l-4 bg-background p-3 text-xs shadow-xs transition-shadow hover:shadow-md ${
          card.blockedReason ? 'border-destructive/50' : 'border-border'
        } ${cardKindStyle(card.kind).edge} ${card.archivedAt ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start gap-1.5">
          {card.blockedReason && (
            <Tooltip content={card.blockedReason}>
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                data-testid="board-card-blocked"
                aria-label={t('card.blocked.label')}
              />
            </Tooltip>
          )}
          <p className="line-clamp-2 flex-1 text-[13px] leading-snug font-medium text-foreground">
            {card.title}
          </p>
          {actions && <CardActionsMenu {...actions} compact testId="board-card-actions-menu" />}
        </div>

        {card.description && (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {card.description}
          </p>
        )}

        {hasBadges && (
          <div className="flex flex-wrap items-center gap-1" data-testid="board-card-tags">
            {cardTags.map((tag) => (
              <span
                key={tag.id}
                data-testid={`board-card-tag-${tag.id}`}
                // Filled, not tinted: at this size a 13%-alpha chip reads as grey on grey, and the
                // tag's whole job here is to be recognisable before the title is read. The ink is
                // measured against the fill rather than fixed — see `readableTextOn`.
                className="rounded-[3px] px-1.5 py-0.5 text-[10px] leading-tight font-semibold tracking-wide uppercase"
                style={{ backgroundColor: tag.color, color: readableTextOn(tag.color) }}
              >
                {tag.name}
              </span>
            ))}

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

            <CardArchivedBadge archivedAt={card.archivedAt} compact testId="board-card-archived" />
          </div>
        )}

        {/* The footer is always drawn, even on a card with nothing but a title: it carries the kind
            glyph, which every card has, and it is what gives the row of cards one baseline. */}
        <div className="flex items-center gap-1.5 pt-0.5 text-[10px] text-muted-foreground">
          <CardKindIcon kind={card.kind} />
          {identifier && (
            // Heavier than the metadata around it, but in the footer's own ink: the colour is the
            // *tile*'s job, and saying the same thing twice side by side would make a card of three
            // coloured marks where the eye only needs one.
            <span
              data-testid="board-card-identifier"
              className="font-mono font-semibold tracking-tight"
            >
              {identifier}
            </span>
          )}

          <span className="ml-auto flex items-center gap-2">
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
            <CardPriorityIcon priority={card.priority} />
            {card.assignee && (
              <span data-testid="board-card-assignee" className="flex shrink-0 items-center">
                <CommitAvatar
                  name={card.assignee}
                  avatarUrl={avatarUrlFor?.(card.assignee)}
                  size={22}
                />
              </span>
            )}
          </span>
        </div>
      </Card>
    </div>
  )
}
