import { useTranslation } from '@git-manager/i18n'
import { Badge, Tooltip } from '@git-manager/ui'
import { Archive } from 'lucide-react'

interface CardArchivedBadgeProps {
  /** The card's `archivedAt`. Nothing is rendered without one, so the caller needs no condition. */
  archivedAt?: string
  /** Smaller and quieter, for the card face where this sits on a dense tile. */
  compact?: boolean
  /**
   * The badge's `data-testid`. Required rather than defaulted because both mount points can be on
   * screen at once — the card face is still behind the open card dialog — and a shared id there is
   * one that always matches two elements. Same reasoning as `CardActionsMenu`.
   */
  testId: string
}

/**
 * Says that a card is archived, wherever the card is being looked at.
 *
 * One component for both mount points rather than a badge per screen, because they answer the same
 * question and had already started to disagree: the card face carried a hand-rolled `bg-muted` chip
 * and the card dialog carried **nothing at all**, so archiving a card from the dialog changed the
 * screen in no way whatsoever. The action succeeded, the card left the board behind the dialog, and
 * the only thing that said so was the `⋯` menu quietly swapping "Archive" for "Restore".
 *
 * The date lives in a tooltip rather than beside the label: "archived" is the fact worth reading at a
 * glance, and *when* is the follow-up question that only some readers have. It is also the only place
 * `archivedAt` is rendered outside the archive list, which is what keeps the two consistent.
 */
export function CardArchivedBadge({ archivedAt, compact, testId }: CardArchivedBadgeProps) {
  const { t } = useTranslation('board')
  if (!archivedAt) return null

  return (
    <Tooltip content={t('card.archivedOn', { date: archivedAt.slice(0, 10) })}>
      <Badge
        variant="secondary"
        data-testid={testId}
        className={
          compact
            ? 'gap-1 rounded-[3px] px-1.5 py-0.5 text-[10px] leading-tight tracking-wide uppercase'
            : 'shrink-0 gap-1'
        }
      >
        <Archive className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        {t('card.archivedBadge')}
      </Badge>
    </Tooltip>
  )
}
