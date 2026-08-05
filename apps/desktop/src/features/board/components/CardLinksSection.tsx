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
import { CardKindIcon } from './CardKindIcon'
import { CardLinkPicker } from './CardLinkPicker'
import { CardContentSection } from './CardContentSection'

interface CardLinksSectionProps {
  card: BoardCard
  /** The loaded board's cards: both the candidates and what the inverse halves are derived from. */
  cards: BoardCard[]
  /** Every board of the repo — a link across boards is named by its board, not left as a bare id. */
  boards: Board[]
  onAdd: (target: BoardCard, kind: DisplayedLinkKind) => Promise<unknown>
  onRemove: (link: ResolvedLink) => Promise<unknown>
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
 */
export function CardLinksSection({
  card,
  cards,
  boards,
  onAdd,
  onRemove,
  readOnly,
}: CardLinksSectionProps) {
  const { t } = useTranslation('board')
  const [picking, setPicking] = useState(false)

  const links = useMemo(() => resolveCardLinks(card, cards), [card, cards])
  const candidates = useMemo(() => cards.filter((c) => c.id !== card.id), [cards, card.id])

  return (
    <CardContentSection
      title={t('card.links.label')}
      sectionKey="card-links"
      testId="card-links-section"
      aside={
        readOnly ? undefined : (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label={t('card.links.add')}
            title={t('card.links.add')}
            onClick={() => setPicking((open) => !open)}
            data-testid="card-links-add"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )
      }
    >
      {links.length === 0 ? (
        <p className="text-xs italic text-muted-foreground" data-testid="card-links-empty">
          {t('card.links.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {LINK_KIND_ORDER.filter((kind) => links.some((l) => l.kind === kind)).map((kind) => (
            <div key={kind} data-testid={`card-links-group-${kind}`}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t(`card.links.group.${kind}`)}
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {links
                  .filter((l) => l.kind === kind)
                  .map((link) => (
                    <LinkRow
                      key={`${link.kind}-${link.targetBoardId}-${link.targetCardId}`}
                      link={link}
                      currentBoardId={card.boardId}
                      boards={boards}
                      onRemove={onRemove}
                      readOnly={readOnly}
                    />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {picking && (
        <CardLinkPicker
          candidates={candidates}
          onPick={onAdd}
          onClose={() => setPicking(false)}
        />
      )}
    </CardContentSection>
  )
}

function LinkRow({
  link,
  currentBoardId,
  boards,
  onRemove,
  readOnly,
}: {
  link: ResolvedLink
  currentBoardId: string
  boards: Board[]
  onRemove: (link: ResolvedLink) => Promise<unknown>
  readOnly?: boolean
}) {
  const { t } = useTranslation('board')
  const identifier = link.card ? cardIdentifier(link.card) : undefined
  const board = boards.find((b) => b.id === link.targetBoardId)
  // Unresolved *and* pointing at the board on screen: the card it names is gone, not elsewhere.
  const onThisBoard = link.targetBoardId === currentBoardId

  return (
    <li
      className="flex min-w-0 items-center gap-1.5 text-[11px]"
      data-testid={`card-link-${link.targetCardId}`}
    >
      {link.card ? (
        <>
          <CardKindIcon kind={link.card.kind} />
          {identifier && (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {identifier}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-foreground">{link.card.title}</span>
        </>
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
            className="min-w-0 flex-1 truncate italic text-muted-foreground"
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
