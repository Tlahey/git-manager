import { useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, NativeSelect } from '@git-manager/ui'
import { Plus, X } from 'lucide-react'

interface CardPrefixPickerProps {
  /** The prefixes the board offers — see `Board.cardPrefixes`. */
  prefixes: string[]
  value: string
  onChange: (prefix: string) => void
  disabled?: boolean
}

/** The sentinel for "no identifier at all" — an empty prefix, which is what the card then stores. */
const NO_PREFIX = ''

/**
 * Which identifier sequence a new card draws its number from, with a way to start a new one.
 *
 * The board *offers* prefixes; it does not own them (see `Board.cardPrefixes`), and a prefix typed
 * here is added to the board's list by the backend as it writes the card — the same commit, so a
 * board can never end up numbering a sequence it doesn't list. That is why this component only ever
 * reports a string upwards and never writes anything itself.
 *
 * "No identifier" stays a real option rather than being implied by an empty field: a card without
 * one is a deliberate choice on a board that has sequences, not a form left half-filled.
 */
export function CardPrefixPicker({ prefixes, value, onChange, disabled }: CardPrefixPickerProps) {
  const { t } = useTranslation('board')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  // A prefix typed here is selectable straight away, before any board write has happened — the
  // select is otherwise the board's list, which won't hold it until the card is created.
  const options = value && !prefixes.includes(value) ? [...prefixes, value] : prefixes

  function commitDraft() {
    const normalized = draft.trim().toUpperCase()
    if (!normalized) return
    onChange(normalized)
    setDraft('')
    setAdding(false)
  }

  if (adding) {
    return (
      <div className="flex gap-1.5" data-testid="card-prefix-picker">
        <Input
          value={draft}
          autoFocus
          maxLength={10}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitDraft()
            }
          }}
          placeholder={t('createBoard.prefixPlaceholder')}
          className="h-8 text-xs uppercase"
          data-testid="card-prefix-new-input"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={disabled || !draft.trim()}
          onClick={commitDraft}
          data-testid="card-prefix-new-confirm"
        >
          {t('boardSettings.addPrefix')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={disabled}
          aria-label={t('card.dialog.cancel')}
          onClick={() => {
            setDraft('')
            setAdding(false)
          }}
          data-testid="card-prefix-new-cancel"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex gap-1.5" data-testid="card-prefix-picker">
      <NativeSelect
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
        data-testid="card-prefix-select"
      >
        <option value={NO_PREFIX}>{t('card.prefix.none')}</option>
        {options.map((prefix) => (
          <option key={prefix} value={prefix}>
            {prefix}
          </option>
        ))}
      </NativeSelect>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        disabled={disabled}
        aria-label={t('card.prefix.add')}
        onClick={() => setAdding(true)}
        data-testid="card-prefix-add"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
