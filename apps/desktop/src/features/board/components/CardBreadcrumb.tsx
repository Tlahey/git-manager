import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Popover, PopoverContent, PopoverTrigger } from '@git-manager/ui'
import { Plus } from 'lucide-react'
import type { Board, BoardCard } from '@git-manager/git-types'
import { cardIdentifier, issueReference } from '../lib/cardMeta'
import { parentOf, type DisplayedLinkKind } from '../lib/cardLinks'
import { CardKindIcon } from './CardKindIcon'
import { CardLinkPicker } from './CardLinkPicker'

interface CardBreadcrumbProps {
  card: BoardCard
  boardName?: string
  /** Which backend the board runs on — the only thing that tells a remote card (which *is* an
   * issue) from a local one that happens to be numbered. */
  boardSource?: Board['source']
  /** The loaded board's cards — what the parent is derived from, and the picker's candidates. */
  cards?: BoardCard[]
  /** Opens another card in place of this one; omitted leaves the parent unclickable. */
  onOpenCard?: (cardId: string) => void
  onAddLink?: (target: BoardCard, kind: DisplayedLinkKind) => Promise<unknown>
  readOnly?: boolean
}

/**
 * Where the card sits: its board, the card it is part of, and the name it is quoted by.
 *
 * A breadcrumb rather than a label because that is what the three are — a path, read left to right,
 * each segment a place you can go. The parent segment is the one that isn't merely decoration: a
 * card's epic is the single most useful thing to reach from it, and until now the only way to set one
 * was to scroll to the relations block and pick "is part of" out of five options.
 *
 * **Setting a parent writes `contains` on the parent**, not `partOf` here — only forward halves are
 * stored (see `cardLinks.ts`). Changing or removing one stays in the relations section, which is
 * where relations live and already lists every one of them; this offers the gesture that was
 * missing, not a second place to manage them.
 *
 * **The picker is a popover anchored on the button, not a panel opened under the path**, for the
 * reason `CardFieldRow` states about its own editors: the breadcrumb is the dialog's first line, so
 * growing it pushed the title, the description and every field below it down the moment the button
 * was pressed — the user then chose a parent against a layout that had just moved. Anchored, the
 * candidates are the click's answer and nothing behind them shifts.
 */
export function CardBreadcrumb({
  card,
  boardName,
  boardSource,
  cards,
  onOpenCard,
  onAddLink,
  readOnly,
}: CardBreadcrumbProps) {
  const { t } = useTranslation('board')
  const [picking, setPicking] = useState(false)

  const identifier = cardIdentifier(card)
  const issue = issueReference(card, boardSource)
  const parent = cards ? parentOf(card, cards) : undefined
  const parentCard = parent?.card
  const canAddParent = Boolean(cards && onAddLink) && !readOnly && !parent

  return (
    <div data-testid="card-breadcrumb">
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {boardName && <span className="min-w-0 truncate">{boardName}</span>}

        {boardName && (parentCard || canAddParent) && <span aria-hidden>/</span>}

        {parentCard ? (
          <button
            type="button"
            onClick={() => onOpenCard?.(parentCard.id)}
            disabled={!onOpenCard}
            title={parentCard.title}
            aria-label={parentCard.title}
            data-testid="card-breadcrumb-parent"
            className="flex min-w-0 cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent"
          >
            <CardKindIcon kind={parentCard.kind} />
            <span className="min-w-0 truncate">
              {cardIdentifier(parentCard) ?? parentCard.title}
            </span>
          </button>
        ) : (
          canAddParent &&
          cards &&
          onAddLink && (
            <Popover open={picking} onOpenChange={setPicking}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="card-breadcrumb-add-parent"
                  className="flex cursor-pointer items-center gap-0.5 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  {t('card.parent.add')}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-72 p-1.5"
                // The picker focuses its own search field; letting the popover focus whatever comes
                // first would land on the list instead and swallow the typing it invites.
                onOpenAutoFocus={(e) => e.preventDefault()}
                data-testid="card-parent-picker"
              >
                <CardLinkPicker
                  candidates={cards.filter((c) => c.id !== card.id)}
                  kind="partOf"
                  onPick={onAddLink}
                  onClose={() => setPicking(false)}
                />
              </PopoverContent>
            </Popover>
          )
        )}

        {/*
          The path exists to end at the card you are looking at, so the last segment is always drawn.

          Which name it uses depends on what the card *has*: its own identifier, the issue's `#42`,
          both when it is a tracked card (the two are different facts — where the work sits here, and
          what it is called on GitHub), and failing everything the title, because a breadcrumb ending
          at the parent would say you are somewhere you are not.

          It carries this card's own kind tile too, the way the parent segment carries the parent's:
          both segments then read the same, and the kind stays visible while the sidebar that spells
          it out is scrolled away.
        */}
        {(boardName || parentCard || canAddParent) && <span aria-hidden>/</span>}
        <CardKindIcon kind={card.kind} />
        {identifier && (
          <span data-testid="card-identifier" className="font-mono text-foreground">
            {identifier}
          </span>
        )}
        {issue && (
          <span
            data-testid="card-breadcrumb-issue"
            className={`font-mono ${identifier ? 'text-muted-foreground' : 'text-foreground'}`}
          >
            {issue}
          </span>
        )}
        {!identifier && !issue && (
          <span data-testid="card-breadcrumb-title" className="min-w-0 truncate text-foreground">
            {card.title}
          </span>
        )}
      </p>
    </div>
  )
}
