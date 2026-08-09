import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger } from '@git-manager/ui'
import { Check } from 'lucide-react'
import type { BoardCard } from '@git-manager/git-types'
import { cardIdentifier } from '../lib/cardMeta'
import { LINK_KIND_ORDER, type DisplayedLinkKind } from '../lib/cardLinks'
import { CardCandidateList } from './CardCandidateList'

interface CardLinkDraftRowProps {
  /** The board's other cards. The card being linked *from* is excluded by the caller. */
  candidates: BoardCard[]
  onAdd: (target: BoardCard, kind: DisplayedLinkKind) => Promise<unknown>
  /** Abandons the draft — Escape here, and the "+" that opened it. */
  onCancel: () => void
}

/** How the chosen card is written back into the field: the name it is known by on the board. */
function displayName(card: BoardCard): string {
  const identifier = cardIdentifier(card)
  return identifier ? `${identifier} ${card.title}` : card.title
}

/**
 * The relation being written, as one more row of the list it is about to join.
 *
 * A row rather than a panel: what is being composed *is* a row — a relation, a card, and the same
 * shape the finished ones have — so it is drafted in place, at the end of the list, and the list
 * grows by exactly the line the user is filling in. The panel it replaced said the same three things
 * stacked vertically somewhere else on screen, which made adding a second relation a matter of
 * finding the panel again rather than of typing another line.
 *
 * It reads left to right the way the sentence does — **this card** *blocks* **that one** — so the
 * relation is chosen first and the card second: the same card is a different fact depending on which
 * relation was picked, and the field's placeholder cannot say what you are searching *for* until it
 * is. All five readings are offered, inverses included; choosing "is blocked by" writes `blocks` on
 * the card you picked (see `cardLinks.ts`'s `linkWrite`), so the storage rule holds without the user
 * having to know it and open the other card to express the obvious.
 *
 * **The confirm button is the only thing that writes.** Clicking a suggestion fills the field, and
 * typing on afterwards clears the choice — a name is not a card, and adding on the click would make
 * a mis-hit in a list of similar titles an edit to undo rather than a keystroke to correct.
 */
export function CardLinkDraftRow({ candidates, onAdd, onCancel }: CardLinkDraftRowProps) {
  const { t } = useTranslation('board')
  const [kind, setKind] = useState<DisplayedLinkKind>('relates')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<BoardCard | null>(null)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!rowRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  function pick(card: BoardCard) {
    setPicked(card)
    setQuery(displayName(card))
    setOpen(false)
    inputRef.current?.focus()
  }

  async function submit() {
    if (!picked || pending) return
    setPending(true)
    try {
      await onAdd(picked, kind)
      onCancel()
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      ref={rowRef}
      className="relative mt-1 flex items-center gap-1.5"
      data-testid="card-link-draft"
    >
      <Select
        value={kind}
        disabled={pending}
        onValueChange={(next) => setKind(next as DisplayedLinkKind)}
      >
        <SelectTrigger
          aria-label={t('card.links.kindLabel')}
          className="h-7 w-32 shrink-0 text-[11px]"
          data-testid="card-link-kind"
        >
          <span className="truncate">{t(`card.links.kind.${kind}`)}</span>
        </SelectTrigger>
        <SelectContent
          // Settling the relation hands the row on to what it still needs — the card — rather than
          // parking focus back on the answered question. Radix would restore it to the trigger.
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          {LINK_KIND_ORDER.map((value) => (
            <SelectItem
              key={value}
              value={value}
              className="text-xs"
              data-testid={`card-link-kind-${value}`}
            >
              {t(`card.links.kind.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        ref={inputRef}
        value={query}
        disabled={pending}
        onChange={(e) => {
          setQuery(e.target.value)
          // Typing on past a choice unmakes it: the text no longer names the card that was picked,
          // and confirming a stale one would add a relation the row has stopped showing.
          setPicked(null)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            if (open) setOpen(false)
            else onCancel()
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          }
        }}
        placeholder={t('card.links.searchPlaceholder')}
        aria-label={t('card.links.searchPlaceholder')}
        inputSize="sm"
        className="min-w-0 flex-1"
        data-testid="card-link-search"
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={!picked || pending}
        aria-label={t('card.links.confirm')}
        title={t('card.links.confirm')}
        onClick={() => void submit()}
        data-testid="card-link-draft-add"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-popover mt-1 rounded-md border border-border bg-popover p-1 shadow-md">
          <CardCandidateList
            candidates={candidates}
            // Re-opening on a filled field offers every card rather than the one already in it: the
            // field then stays re-choosable and not merely re-typeable, as `Combobox` does.
            query={picked ? '' : query}
            onPick={pick}
            disabled={pending}
          />
        </div>
      )}
    </div>
  )
}
