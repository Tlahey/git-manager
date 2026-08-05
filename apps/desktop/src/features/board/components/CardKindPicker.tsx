import { useTranslation } from '@git-manager/i18n'
import type { BoardCardKind } from '@git-manager/git-types'
import { CardKindIcon } from './CardKindIcon'

interface CardKindPickerProps {
  value: BoardCardKind
  onChange: (kind: BoardCardKind) => void
  disabled?: boolean
}

const KINDS: BoardCardKind[] = ['task', 'bug', 'epic']

/**
 * Task / Bug / Epic, as a segmented row.
 *
 * Three options, always all three visible: which one a card is changes how everything else on it
 * reads, and hiding that behind a dropdown would make the common case (a task) look like the only
 * case. The buttons wrap real `name`-grouped radios rather than styling divs, which is the pattern
 * `packages/ui`'s `radio-group.tsx` points segmented controls at — the browser then supplies
 * grouping, arrow-key roving focus and the announced role for free.
 */
export function CardKindPicker({ value, onChange, disabled }: CardKindPickerProps) {
  const { t } = useTranslation('board')

  return (
    <div className="flex gap-2" data-testid="card-kind-picker">
      {KINDS.map((kind) => (
        <label
          key={kind}
          data-testid={`card-kind-option-${kind}`}
          className={`flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
            value === kind
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border text-muted-foreground hover:bg-accent'
          } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        >
          <input
            type="radio"
            name="board-card-kind"
            value={kind}
            checked={value === kind}
            disabled={disabled}
            onChange={() => onChange(kind)}
            className="sr-only"
          />
          <CardKindIcon kind={kind} />
          {t(`card.kind.${kind}`)}
        </label>
      ))}
    </div>
  )
}
