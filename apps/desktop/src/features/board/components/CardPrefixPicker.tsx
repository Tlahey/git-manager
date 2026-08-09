import { useTranslation } from '@git-manager/i18n'
import { Combobox } from '@git-manager/components'

interface CardPrefixPickerProps {
  /** The prefixes the board offers — see `Board.cardPrefixes`. */
  prefixes: string[]
  value: string
  onChange: (prefix: string) => void
  disabled?: boolean
}

/** Prefixes are identifiers, and `GM-7` and `gm-7` must not be two sequences. */
function normalizePrefix(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/**
 * Which identifier sequence a new card draws its number from.
 *
 * The board *offers* prefixes; it does not own them (see `Board.cardPrefixes`), and a prefix typed
 * here is added to the board's list by the backend as it writes the card — the same commit, so a
 * board can never end up numbering a sequence it doesn't list. That is why this component only ever
 * reports a string upwards and never writes anything itself.
 *
 * **Choosing and creating are one gesture.** This was a select with a `+` button beside it, which
 * made starting a sequence a different act from picking one — a mode to enter, confirm and leave.
 * It is a {@link Combobox}: the offered prefixes drop down on click, and anything typed is simply
 * the value. The board's list is a convenience, never the permitted set.
 *
 * **A card always gets an identifier**, so there is no "none" option to pick: the form requires a
 * prefix (`CreateCardDialog` won't submit without one) and a board always offers at least one
 * (`offeredCardPrefixes`). Cards with no identifier still exist — they were made before boards had
 * sequences, and `AssignIdentifiersRow` is how they get one — but they can no longer be made.
 */
export function CardPrefixPicker({ prefixes, value, onChange, disabled }: CardPrefixPickerProps) {
  const { t } = useTranslation('board')

  return (
    <Combobox
      value={value}
      onChange={onChange}
      // The board's list, and only it. The select this replaced had to carry a typed prefix as a
      // synthetic option or the field would have rendered blank; a combobox already shows the value
      // it holds, so leaving the list alone is what lets "this one is new" stay sayable.
      options={prefixes}
      normalize={normalizePrefix}
      maxLength={10}
      disabled={disabled}
      placeholder={t('card.prefix.placeholder')}
      aria-label={t('card.prefix.label')}
      freeValueLabel={(prefix) => t('card.prefix.new', { prefix })}
      emptyLabel={t('card.prefix.empty')}
      inputClassName="h-8 uppercase"
      testId="card-prefix"
    />
  )
}
