import { useTranslation } from '@git-manager/i18n'
import { Bug, Layers, SquareCheck } from 'lucide-react'
import type { BoardCardKind } from '@git-manager/git-types'

interface CardKindIconProps {
  kind: BoardCardKind
  /** Renders the label beside the glyph — for the places with room to spell it out. */
  withLabel?: boolean
  className?: string
}

/**
 * What sort of work a card stands for, as a glyph: a checked square for a task, a bug for a bug, and
 * a stack for an epic — the thing that contains others.
 *
 * The glyph carries the meaning on its own, the way {@link CardPriorityIcon}'s direction does: colour
 * only reinforces it, so the three stay tellable apart for a colour-blind reader, and the
 * `title`/`aria-label` spells it out either way.
 *
 * The epic's violet is Tailwind's, not a theme token — there is no purple tone token, the same gap
 * `pull-requests/components/Badges.tsx` notes for GitHub's merged-PR purple, and this is the colour
 * the remote backend already writes on the `type:epic` label (`remoteCardMapping.ts`), so the board
 * and github.com agree on what an epic looks like.
 */
export function CardKindIcon({ kind, withLabel, className = '' }: CardKindIconProps) {
  const { t } = useTranslation('board')
  const label = t(`card.kind.${kind}`)

  const glyph =
    kind === 'bug' ? (
      <Bug className="h-3.5 w-3.5 shrink-0 text-destructive" />
    ) : kind === 'epic' ? (
      <Layers className="h-3.5 w-3.5 shrink-0 text-purple-500 dark:text-purple-400" />
    ) : (
      <SquareCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    )

  return (
    <span
      title={label}
      aria-label={label}
      data-testid={`card-kind-${kind}`}
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {glyph}
      {withLabel && <span className="text-[11px] text-foreground">{label}</span>}
    </span>
  )
}
