import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { Board, BoardCard } from '@git-manager/git-types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Separator,
  Tooltip,
} from '@git-manager/ui'
import { AlertTriangle, ArchiveRestore, ExternalLink, Trash2 } from 'lucide-react'
import { cardIdentifier } from '../lib/cardMeta'
import { CardKindIcon } from './CardKindIcon'

interface ArchivedCardsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  board: Board
  /** Every card on the board — the archived ones are picked out here. */
  cards: BoardCard[]
  onOpenCard: (card: BoardCard) => void
  onUnarchive: (card: BoardCard) => Promise<unknown>
  onDelete: (card: BoardCard) => void
  /** Raises the purge confirmation for the whole archive. Omitted when the board is read-only. */
  onDeleteAll?: () => void
}

/**
 * Everything the board has archived, in one place.
 *
 * Archiving takes a card out of the columns without destroying it, which only works as a promise if
 * there is somewhere to find it again. Searching the board surfaces an archived card too, but that
 * requires already knowing what to search for — this is the list you read when you don't.
 *
 * Deleting is delegated rather than done here: it is the one irreversible action on a card, and its
 * confirmation lives in `DeleteCardDialog`, which the caller owns. Emptying the whole archive is
 * delegated the same way, to `DeleteArchivedCardsDialog`.
 *
 * That bulk action sits below a separator, in its own labelled danger zone, and it is the only thing
 * there. The list above is made of reversible gestures — restore, open — and one per-card delete
 * already marked destructive; a button that destroys all of them reading as just another row would
 * be a misrepresentation of what it does. The rule is the general one: an action that cannot be
 * undone goes below the waterline, never inline with the ones that can.
 */
export function ArchivedCardsDialog({
  open,
  onOpenChange,
  board,
  cards,
  onOpenCard,
  onUnarchive,
  onDelete,
  onDeleteAll,
}: ArchivedCardsDialogProps) {
  const { t } = useTranslation('board')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const archived = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (
      cards
        .filter((c) => c.archivedAt)
        .filter(
          (c) =>
            !needle ||
            c.title.toLowerCase().includes(needle) ||
            c.description.toLowerCase().includes(needle) ||
            (cardIdentifier(c) ?? '').toLowerCase().includes(needle)
        )
        // Most recently archived first: the one you want back is usually the one you just put away.
        .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
    )
    // `board` is no longer read here: the identifier comes off the card's own prefix.
  }, [cards, query])

  const totalArchived = cards.filter((c) => c.archivedAt).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A list of card titles with three actions on each row — the default width left the titles
          barely readable between the identifier and the buttons.

          The height is capped and the *list* is what gives way, never the dialog. A centered
          `DialogContent` is `overflow-hidden` with no scroller of its own, so a surface taller than
          the window is clipped at the viewport edge, top and bottom, with no way to reach what was
          cut. That is what an uncapped header + fixed-height list + danger zone did on a modest
          window: the padding went with the clipped edge, so the rows read as flush against the
          dialog and the purge button below them was simply gone. `minmax(0,1fr)` on the body row is
          the half that makes the cap work — an implicit grid row is `auto`, which refuses to shrink
          below its content and would hand the overflow straight back. */}
      <DialogContent
        data-testid="archived-cards-dialog"
        size="lg"
        className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>{t('archived.title')}</DialogTitle>
          <DialogDescription>{t('archived.description')}</DialogDescription>
        </DialogHeader>

        {totalArchived === 0 ? (
          <p
            className="py-6 text-center text-xs text-muted-foreground italic"
            data-testid="archived-none"
          >
            {t('archived.none')}
          </p>
        ) : (
          <div className="flex min-h-0 flex-col space-y-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('archived.searchPlaceholder')}
              autoFocus
              className="shrink-0"
              data-testid="archived-search-input"
            />

            {/* 18rem when there is room — the height this list has always had — and the first thing
                to give when there isn't, down to a floor of four rows. `min-h-32` is load-bearing:
                a flex item's `min-height: auto` is its *content* height, which for a scroller full
                of cards is the whole list, and the box would grow to it instead of scrolling.
                `grow basis-72` rather than `flex-1 basis-72`: the `flex` shorthand is emitted after
                `flex-basis` in Tailwind's own order, so `flex-1`'s `0%` basis would win and the box
                would collapse to its floor whatever the window size. */}
            <ScrollArea className="min-h-32 grow basis-72 rounded-md border border-border">
              <ul className="p-1" data-testid="archived-list">
                {archived.length === 0 && (
                  <li className="p-3 text-xs text-muted-foreground" data-testid="archived-empty">
                    {t('archived.noResults')}
                  </li>
                )}
                {archived.map((card) => (
                  <ArchivedRow
                    key={card.id}
                    card={card}
                    identifier={cardIdentifier(card) ?? ''}
                    columnName={board.columns.find((c) => c.id === card.columnId)?.name ?? ''}
                    onOpen={() => onOpenCard(card)}
                    onUnarchive={() => void onUnarchive(card)}
                    onDelete={() => onDelete(card)}
                  />
                ))}
              </ul>
            </ScrollArea>

            {onDeleteAll && (
              // Never the part that gives: the number it names is the whole point of the zone, and
              // a purge button clipped off the bottom edge is how this looked when it broke.
              <div className="shrink-0 space-y-2" data-testid="archived-danger-zone">
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {t('archived.dangerZone')}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {t('archived.dangerZoneHint', { count: totalArchived })}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={onDeleteAll}
                    data-testid="archived-delete-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('archived.deleteAll', { count: totalArchived })}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ArchivedRow({
  card,
  identifier,
  columnName,
  onOpen,
  onUnarchive,
  onDelete,
}: {
  card: BoardCard
  identifier: string
  columnName: string
  onOpen: () => void
  onUnarchive: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('board')

  return (
    <li
      className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
      data-testid={`archived-card-${card.id}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 text-left"
        data-testid={`archived-card-open-${card.id}`}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <CardKindIcon kind={card.kind} className="shrink-0" />
          {identifier && (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {identifier}
            </span>
          )}
          <span className="min-w-0 truncate text-xs text-foreground">{card.title}</span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          {t('archived.rowMeta', {
            column: columnName,
            date: (card.archivedAt ?? '').slice(0, 10),
          })}
        </span>
      </button>

      <Tooltip content={t('card.actions.unarchive')}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          onClick={onUnarchive}
          aria-label={t('card.actions.unarchive')}
          data-testid={`archived-card-unarchive-${card.id}`}
        >
          <ArchiveRestore className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>

      <Tooltip content={t('archived.open')}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          onClick={onOpen}
          aria-label={t('archived.open')}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>

      <Tooltip content={t('card.dialog.delete')}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0 text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label={t('card.dialog.delete')}
          data-testid={`archived-card-delete-${card.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    </li>
  )
}
