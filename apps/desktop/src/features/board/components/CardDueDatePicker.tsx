import { useTranslation } from '@git-manager/i18n'
import { Input } from '@git-manager/ui'
import { Check, X } from 'lucide-react'
import { dueDateShortcuts } from '../lib/cardMeta'

interface CardDueDatePickerProps {
  /** The date on the card, as stored (`YYYY-MM-DD`). */
  dueDate?: string
  onSelect: (date: string | null) => void
}

/**
 * The card's deadline, picked from the dates it is nearly always going to be.
 *
 * A date is the one card field with no list of values, which is why it used to open a bare date
 * input — a control whose calendar is another two clicks away and whose keyboard form differs per
 * locale. Since almost every deadline set on a board is today, tomorrow or a week out, those are
 * offered as rows like any other field's values, and the input stays underneath for the dates that
 * are none of the three.
 *
 * The exact date rides beside each label: "in a week" is only actionable if the user can see which
 * day that lands on.
 */
export function CardDueDatePicker({ dueDate, onSelect }: CardDueDatePickerProps) {
  const { t } = useTranslation('board')

  return (
    <div data-testid="card-due-date-picker" className="flex flex-col">
      {dueDateShortcuts().map(({ key, date }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(date)}
          data-testid={`card-due-date-option-${key}`}
          className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-foreground hover:bg-accent"
        >
          <span className="min-w-0 flex-1 truncate">{t(`card.dueDate.${key}`)}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{date}</span>
          {dueDate === date && <Check className="h-3 w-3 shrink-0 text-primary" />}
        </button>
      ))}

      <div className="mt-1 border-t border-border px-2 pt-1.5 pb-1">
        <label htmlFor="card-due-date-input" className="block text-[10px] text-muted-foreground">
          {t('card.dueDate.custom')}
        </label>
        <Input
          id="card-due-date-input"
          type="date"
          value={dueDate ?? ''}
          onChange={(e) => onSelect(e.target.value || null)}
          className="mt-1 h-7 text-xs"
          data-testid="card-due-date-input"
        />
      </div>

      {dueDate && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          data-testid="card-due-date-clear"
          className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3 w-3 shrink-0" />
          {t('card.meta.clearDueDate')}
        </button>
      )}
    </div>
  )
}
