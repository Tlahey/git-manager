import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { BoardCard } from '@git-manager/git-types'
import { cardIdentifier } from '../lib/cardMeta'
import { matchLinkCandidates } from '../lib/searchCards'
import { CardKindIcon } from './CardKindIcon'

interface CardCandidateListProps {
  /** The cards that may be chosen. The one being linked *from* is excluded by the caller, since a
   * card cannot relate to itself. */
  candidates: BoardCard[]
  /** What has been typed. Blank offers the whole list — see `matchLinkCandidates`. */
  query: string
  onPick: (card: BoardCard) => void
  disabled?: boolean
  /** Applied to the scroller, for the height the list has room for where it is being shown. */
  className?: string
}

/**
 * The cards on offer as the other end of a relation, narrowed by what has been typed.
 *
 * Shared by the two places that choose one — the breadcrumb's parent popover and the relations
 * section's draft row — because "which card do you mean" is one question with one answer, and two
 * copies of it would drift into two rankings and two ways of saying there is nothing to show.
 *
 * Each row carries the kind tile and the identifier beside the title: those are what a card is
 * recognised by on the board, and a list of bare titles makes the user read sentences to find the
 * ticket they already know the number of.
 */
export function CardCandidateList({
  candidates,
  query,
  onPick,
  disabled,
  className = 'max-h-52',
}: CardCandidateListProps) {
  const { t } = useTranslation('board')
  const matches = useMemo(() => matchLinkCandidates(candidates, query), [candidates, query])

  if (matches.length === 0) {
    return (
      <p
        className="px-2 py-3 text-center text-[11px] text-muted-foreground"
        data-testid="card-link-empty"
      >
        {t('card.links.noCandidates')}
      </p>
    )
  }

  return (
    <div className={`overflow-y-auto ${className}`}>
      {matches.map((candidate) => {
        const identifier = cardIdentifier(candidate)
        return (
          <button
            key={candidate.id}
            type="button"
            disabled={disabled}
            // Kept off the blur path: mousedown would take focus from the search field before the
            // click lands, closing the list under the pointer.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(candidate)}
            data-testid={`card-link-option-${candidate.id}`}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-foreground hover:enabled:bg-accent"
          >
            <CardKindIcon kind={candidate.kind} />
            {identifier && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {identifier}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
          </button>
        )
      })}
    </div>
  )
}
