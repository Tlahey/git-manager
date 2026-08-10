import { useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button } from '@git-manager/ui'
import { Link2, Plus, X } from 'lucide-react'
import type { Board, BoardCard } from '@git-manager/git-types'
import { cardIdentifier } from '../lib/cardMeta'
import {
  LINK_KIND_ORDER,
  resolveCardLinks,
  type DisplayedLinkKind,
  type ResolvedLink,
} from '../lib/cardLinks'
import { useBoardStore } from '../stores/board.store'
import { CardKindIcon } from './CardKindIcon'
import { CardLinkDraftRow } from './CardLinkDraftRow'
import { CardContentSection } from './CardContentSection'

const SECTION_KEY = 'card-links'

interface CardLinksSectionProps {
  card: BoardCard
  /** The loaded board's cards: both the candidates and what the inverse halves are derived from. */
  cards: BoardCard[]
  /** Every board of the repo — a link across boards is named by its board, not left as a bare id. */
  boards: Board[]
  onAdd: (target: BoardCard, kind: DisplayedLinkKind) => Promise<unknown>
  onRemove: (link: ResolvedLink) => Promise<unknown>
  /** Opens a related card in place of this one. Omitted leaves the rows unclickable — a row whose
   * other end isn't loaded has nothing to open either way. */
  onOpenCard?: (cardId: string) => void
  readOnly?: boolean
}

/**
 * A card's relationships to other cards — which is also where an epic lists what it contains and a
 * card says which epic it belongs to. One section rather than three: "contains", "part of" and
 * "blocks" are the same kind of fact read from different ends, and splitting them by name would put
 * the same relation in two places depending on which card you opened.
 *
 * A row whose other end is on a board that isn't loaded names **the board**. That is not a
 * degradation to hide: the link is real, and "somewhere on Sprint 12" is the true and complete
 * answer this side can give — see `cardLinks.ts`.
 *
 * **Adding one is drafted as a row of this list**, not composed in a panel elsewhere: see
 * `CardLinkDraftRow`. The "+" therefore unfolds the section when it is folded — the row it opens
 * lives among the children a folded section does not render, so leaving it folded would be a button
 * that visibly does nothing.
 */
export function CardLinksSection({
  card,
  cards,
  boards,
  onAdd,
  onRemove,
  onOpenCard,
  readOnly,
}: CardLinksSectionProps) {
  const { t } = useTranslation('board')
  const [drafting, setDrafting] = useState(false)
  const collapsed = useBoardStore((s) => s.isCardSectionCollapsed(SECTION_KEY))
  const toggleCollapsed = useBoardStore((s) => s.toggleCardSectionCollapsed)

  const links = useMemo(() => resolveCardLinks(card, cards), [card, cards])
  const candidates = useMemo(() => cards.filter((c) => c.id !== card.id), [cards, card.id])

  function draft() {
    if (collapsed) toggleCollapsed(SECTION_KEY)
    setDrafting((open) => !open)
  }

  return (
    <CardContentSection
      title={t('card.links.label')}
      sectionKey={SECTION_KEY}
      testId="card-links-section"
      aside={
        readOnly ? undefined : (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label={t('card.links.add')}
            title={t('card.links.add')}
            onClick={draft}
            data-testid="card-links-add"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )
      }
    >
      {links.length === 0 && !drafting ? (
        <p className="text-xs text-muted-foreground italic" data-testid="card-links-empty">
          {t('card.links.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {LINK_KIND_ORDER.filter((kind) => links.some((l) => l.kind === kind)).map((kind) => (
            <div key={kind} data-testid={`card-links-group-${kind}`}>
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                {t(`card.links.group.${kind}`)}
              </p>
              <ul className="mt-0.5">
                {links
                  .filter((l) => l.kind === kind)
                  .map((link) => (
                    <LinkRow
                      key={`${link.kind}-${link.targetBoardId}-${link.targetCardId}`}
                      link={link}
                      currentBoardId={card.boardId}
                      boards={boards}
                      onRemove={onRemove}
                      onOpenCard={onOpenCard}
                      readOnly={readOnly}
                    />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {drafting && (
        <CardLinkDraftRow
          candidates={candidates}
          onAdd={onAdd}
          onCancel={() => setDrafting(false)}
        />
      )}
    </CardContentSection>
  )
}

/**
 * One relation, as a row you can walk through to the card at the other end.
 *
 * **The whole row is the target, not the identifier inside it.** A relation is read as "this card,
 * over there", and the useful gesture on it is going there — so the row lights up under the pointer
 * and opens the card, the way the breadcrumb's parent segment does. The name alone would be a
 * three-character hit area in an eleven-pixel line.
 *
 * The clickable part is a `button` *inside* the `li` rather than a handler on the `li` itself: the
 * remove control is a button too, and a button inside a button is invalid HTML the browser silently
 * unnests. The `li` keeps the hover fill and lends it to both, which is what makes them read as one
 * row rather than two controls that happen to be adjacent.
 *
 * A row whose other end isn't loaded — another board, or a card that is gone — stays plain text.
 * There is nothing to open, and a hover state promising otherwise would be a lie.
 */
function LinkRow({
  link,
  currentBoardId,
  boards,
  onRemove,
  onOpenCard,
  readOnly,
}: {
  link: ResolvedLink
  currentBoardId: string
  boards: Board[]
  onRemove: (link: ResolvedLink) => Promise<unknown>
  onOpenCard?: (cardId: string) => void
  readOnly?: boolean
}) {
  const { t } = useTranslation('board')
  const identifier = link.card ? cardIdentifier(link.card) : undefined
  const board = boards.find((b) => b.id === link.targetBoardId)
  // Unresolved *and* pointing at the board on screen: the card it names is gone, not elsewhere.
  const onThisBoard = link.targetBoardId === currentBoardId
  const target = link.card
  const openable = Boolean(target && onOpenCard)

  const name = target && (
    <>
      <CardKindIcon kind={target.kind} />
      {identifier && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{identifier}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-left text-foreground">{target.title}</span>
    </>
  )

  return (
    <li
      className={`group flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-[11px] transition-colors ${
        openable ? 'hover:bg-accent' : ''
      }`}
      data-testid={`card-link-${link.targetCardId}`}
    >
      {target ? (
        openable ? (
          <button
            type="button"
            onClick={() => onOpenCard?.(target.id)}
            title={target.title}
            aria-label={target.title}
            data-testid={`card-link-open-${link.targetCardId}`}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            {name}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">{name}</span>
        )
      ) : (
        /*
         * Two different unresolved cases, and they must not read alike. A link to *another* board is
         * whole and true — naming the board is the complete answer this side can give, and inventing
         * a placeholder ticket would not be. A link into the board we are *looking at* whose card is
         * absent is a dangling one: saying "a card on Sprint 12" while showing Sprint 12 reads as a
         * lie rather than as a degradation.
         */
        <>
          <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span
            className="min-w-0 flex-1 truncate text-muted-foreground italic"
            data-testid={
              onThisBoard
                ? `card-link-missing-${link.targetCardId}`
                : `card-link-elsewhere-${link.targetCardId}`
            }
          >
            {onThisBoard
              ? t('card.links.missing')
              : board
                ? t('card.links.onBoard', { board: board.name })
                : t('card.links.onUnknownBoard')}
          </span>
        </>
      )}

      {!readOnly && (
        <button
          type="button"
          aria-label={t('card.links.remove')}
          title={t('card.links.remove')}
          onClick={() => void onRemove(link)}
          data-testid={`card-link-remove-${link.targetCardId}`}
          className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </li>
  )
}
