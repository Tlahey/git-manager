import { useTranslation } from '@git-manager/i18n'
import { ChevronDown, ChevronUp, Equal } from 'lucide-react'
import type { BoardCardPriority } from '@git-manager/git-types'

interface CardPriorityIconProps {
  priority: BoardCardPriority
  /** Renders the label beside the glyph — for the side panel, where there is room to spell it out. */
  withLabel?: boolean
  className?: string
}

/**
 * A card's priority as a glyph: chevron up for high, an equals sign for normal, chevron down for low.
 *
 * Colour carries the same meaning as the direction — red up, blue down — so the two reinforce each
 * other rather than the colour being the only signal, which would leave the distinction invisible to
 * a red/blue colour-blind reader. The `title`/`aria-label` spells it out either way.
 */
export function CardPriorityIcon({ priority, withLabel, className = '' }: CardPriorityIconProps) {
  const { t } = useTranslation('board')
  const label = t(`card.priority.${priority}`)

  const glyph =
    priority === 'high' ? (
      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-destructive" />
    ) : priority === 'low' ? (
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-tone-info" />
    ) : (
      <Equal className="h-3 w-3 shrink-0 text-muted-foreground" />
    )

  return (
    <span
      title={label}
      aria-label={label}
      data-testid={`card-priority-${priority}`}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {glyph}
      {withLabel && <span className="text-[11px] text-foreground">{label}</span>}
    </span>
  )
}
