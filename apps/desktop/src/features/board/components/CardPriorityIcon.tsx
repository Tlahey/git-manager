import { useTranslation } from '@git-manager/i18n'
import type { BoardCardPriority } from '@git-manager/git-types'
import { cardPriorityStyle } from './cardPriority.config'

interface CardPriorityIconProps {
  priority: BoardCardPriority
  /** Renders the label beside the glyph — for the side panel, where there is room to spell it out. */
  withLabel?: boolean
  className?: string
}

/**
 * A card's priority as a glyph: chevron up for high, an equals sign for normal, chevron down for low.
 *
 * The glyph and its ink both come from {@link CARD_PRIORITY_STYLES}, which is where the rule that
 * colour only *reinforces* the direction is recorded — the same way {@link CardKindIcon}'s tile does
 * — and where each colour is justified, including the two theme-token answers that were tried first
 * and left high priority a near-black maroon, then a pale pink.
 *
 * With a label, the gap is the one `CardChoiceList` puts between a row's mark and its name: this is
 * the *same* value the list underneath offers, and drawing them apart makes the picker read as a
 * different control from the field it belongs to. Unlabelled it rides a card face among other small
 * marks, where that gap would be dead space.
 */
export function CardPriorityIcon({ priority, withLabel, className = '' }: CardPriorityIconProps) {
  const { t } = useTranslation('board')
  const label = t(`card.priority.${priority}`)
  const { Icon, glyph } = cardPriorityStyle(priority)

  return (
    <span
      title={label}
      aria-label={label}
      data-testid={`card-priority-${priority}`}
      className={`inline-flex items-center ${withLabel ? 'gap-2' : 'gap-0.5'} ${className}`}
    >
      {/* `strokeWidth` up from the stock 2: this is the one mark on the footer with no fill behind
          it, and at 14px the default weight leaves it a hairline. */}
      <Icon className={`shrink-0 ${glyph}`} strokeWidth={2.5} />
      {withLabel && <span className="text-[11px] text-foreground">{label}</span>}
    </span>
  )
}
