import { useTranslation } from '@git-manager/i18n'
import type { BoardCardKind } from '@git-manager/git-types'
import { cardKindStyle } from './cardKind.config'

interface CardKindIconProps {
  kind: BoardCardKind
  /** Renders the label beside the glyph — for the places with room to spell it out. */
  withLabel?: boolean
  className?: string
}

/**
 * What sort of work a card stands for, as a filled tile: a white glyph on the kind's own colour — a
 * checked square for a task, a bug for a bug, a stack for an epic, the thing that contains others.
 *
 * Filled rather than a bare coloured glyph, for the reason the tag badges next to it are filled: at
 * this size a thin outline in a hue reads as grey, and the tile's whole job is to be recognisable
 * from across a column before anything is read. The glyph and the fill both come from
 * {@link CARD_KIND_STYLES}, which is where the rule that colour only *reinforces* the glyph is
 * recorded — the same way {@link CardPriorityIcon}'s direction does — and where each colour is
 * justified.
 */
export function CardKindIcon({ kind, withLabel, className = '' }: CardKindIconProps) {
  const { t } = useTranslation('board')
  const label = t(`card.kind.${kind}`)
  const { Icon, chip } = cardKindStyle(kind)

  return (
    <span
      title={label}
      aria-label={label}
      data-testid={`card-kind-${kind}`}
      className={`inline-flex items-center gap-1 ${className}`}
    >
      <span
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] ${chip}`}
      >
        {/* `strokeWidth` up from the default 2: a 10px glyph reversed out in white loses its lines
            at the stock weight, where the same icon in colour on a pale surface keeps them. */}
        <Icon className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
      </span>
      {withLabel && <span className="text-[11px] text-foreground">{label}</span>}
    </span>
  )
}
