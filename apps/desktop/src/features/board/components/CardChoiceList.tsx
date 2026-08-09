import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

export interface CardChoice<T extends string> {
  value: T
  label: string
  /** The mark the value is recognised by elsewhere — the kind's tile, the priority's chevron. */
  icon?: ReactNode
}

interface CardChoiceListProps<T extends string> {
  options: CardChoice<T>[]
  /** The value currently on the card; the one row that carries a tick. */
  value: T
  onSelect: (value: T) => void
  /** Each row gets `${testIdPrefix}-${value}`. */
  testIdPrefix: string
  ariaLabel: string
}

/**
 * A card field's possible values, as rows that set it on the first click.
 *
 * Written rather than reached for: neither shared primitive fits. A `NativeSelect` is drawn by the
 * OS from the option's *text*, which drops the glyph a kind or a priority is read by — the whole
 * point of those fields being coloured on the board — and a `Select`/`DropdownMenu` brings its own
 * trigger, where the trigger here is the row's value cell (see `CardFieldRow`).
 *
 * The tick is what makes it a read-out as well as a choice: the list says where the card stands
 * before it asks where it should go, so picking is never blind. Same shape as `CardStatusPicker`'s
 * menu, deliberately — a card's fields should all answer a click the same way.
 */
export function CardChoiceList<T extends string>({
  options,
  value,
  onSelect,
  testIdPrefix,
  ariaLabel,
}: CardChoiceListProps<T>) {
  return (
    <div role="listbox" aria-label={ariaLabel} className="flex flex-col">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(option.value)}
            data-testid={`${testIdPrefix}-${option.value}`}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-foreground hover:bg-accent"
          >
            {option.icon}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {selected && <Check className="h-3 w-3 shrink-0 text-primary" />}
          </button>
        )
      })}
    </div>
  )
}
