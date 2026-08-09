import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input } from '@git-manager/ui'
import type { BoardCard } from '@git-manager/git-types'
import { type DisplayedLinkKind } from '../lib/cardLinks'
import { CardCandidateList } from './CardCandidateList'

interface CardLinkPickerProps {
  /** The board's other cards — the candidates. The card being linked *from* is excluded by the
   * caller, since a card cannot relate to itself. */
  candidates: BoardCard[]
  onPick: (target: BoardCard, kind: DisplayedLinkKind) => Promise<unknown>
  /** Called once a pick has landed. Escape and click-outside belong to the popover around it. */
  onClose: () => void
  /**
   * The relation being written, which the caller has already decided. The breadcrumb's "add parent"
   * *is* that decision — offering five relations there would ask the question the button just
   * answered. A relation still to be chosen is drafted in the list instead, by `CardLinkDraftRow`.
   */
  kind: DisplayedLinkKind
}

/**
 * Picks the card at the other end of a relation whose kind is already settled.
 *
 * Only the loaded board's cards are candidates. A cross-board link is representable and *displays*,
 * but creating one would mean searching boards that aren't loaded — deliberately out of scope here.
 *
 * The pick writes immediately, with no confirm step, precisely because the kind is fixed: there is
 * one decision to make and clicking a card *is* making it. Where the kind is open — the relations
 * section — the draft row holds the choice until it is confirmed, since a card alone does not yet say
 * what is being written.
 *
 * **It carries no surface of its own.** The caller anchors it in a `PopoverContent`, which draws the
 * panel and owns dismissal (Escape, click-outside); a border and a shadow here would sit inside that
 * one. `onClose` is therefore only about the *pick* — a chosen card closes the popover, which no
 * dismissal gesture can tell the parent on its own.
 */
export function CardLinkPicker({ candidates, onPick, onClose, kind }: CardLinkPickerProps) {
  const { t } = useTranslation('board')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function pick(target: BoardCard) {
    if (pending) return
    setPending(true)
    try {
      await onPick(target, kind)
      onClose()
    } finally {
      setPending(false)
    }
  }

  return (
    <div data-testid="card-link-picker">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('card.links.searchPlaceholder')}
        aria-label={t('card.links.searchPlaceholder')}
        disabled={pending}
        inputSize="sm"
        className="mb-1.5"
        data-testid="card-link-search"
      />

      <CardCandidateList
        candidates={candidates}
        query={query}
        onPick={(candidate) => void pick(candidate)}
        disabled={pending}
      />
    </div>
  )
}
