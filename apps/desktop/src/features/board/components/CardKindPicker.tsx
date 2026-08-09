import { useTranslation } from '@git-manager/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@git-manager/ui'
import type { BoardCardKind } from '@git-manager/git-types'
import { CardKindIcon } from './CardKindIcon'

interface CardKindPickerProps {
  value: BoardCardKind
  onChange: (kind: BoardCardKind) => void
  disabled?: boolean
}

const KINDS: BoardCardKind[] = ['task', 'bug', 'epic']

/**
 * Task / Bug / Epic, as a dropdown.
 *
 * A dropdown rather than the segmented row this used to be: the new-card form is a stack of one
 * decision per row, and three side-by-side targets spent a whole row stating two alternatives to a
 * default that is almost always right. The closed field says which kind the card will be, which is
 * the only thing that has to be visible for the common case; the other two are one click away.
 *
 * **The kind's colour survives the collapse**, which is what rules out a native `<select>` here. Its
 * closed row is drawn by the OS from the option's *text*, so a tile placed behind it is overdrawn —
 * the app's only kind with no colour on it. The Radix `Select` renders its own trigger, so the mark
 * a card is recognised by on the board is the mark chosen here, in the field and in the list.
 */
export function CardKindPicker({ value, onChange, disabled }: CardKindPickerProps) {
  const { t } = useTranslation('board')

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as BoardCardKind)}
    >
      <SelectTrigger
        aria-label={t('card.meta.kind')}
        className="h-8 text-xs"
        data-testid="card-kind-select"
      >
        {/* Our own row rather than `SelectValue`, which renders the picked item's text alone — the
            tile has to travel into the trigger with it. */}
        <span className="flex min-w-0 items-center gap-2">
          <CardKindIcon kind={value} />
          <span className="truncate">{t(`card.kind.${value}`)}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {KINDS.map((kind) => (
          <SelectItem
            key={kind}
            value={kind}
            className="text-xs"
            data-testid={`card-kind-${kind}-option`}
          >
            <span className="flex items-center gap-2">
              <CardKindIcon kind={kind} />
              {t(`card.kind.${kind}`)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
