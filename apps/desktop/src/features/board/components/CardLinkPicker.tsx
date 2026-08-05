import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, NativeSelect } from '@git-manager/ui'
import type { BoardCard } from '@git-manager/git-types'
import { cardIdentifier } from '../lib/cardMeta'
import { LINK_KIND_ORDER, type DisplayedLinkKind } from '../lib/cardLinks'
import { CardKindIcon } from './CardKindIcon'

interface CardLinkPickerProps {
  /** The board's other cards — the candidates. The card being linked *from* is excluded by the
   * caller, since a card cannot relate to itself. */
  candidates: BoardCard[]
  onPick: (target: BoardCard, kind: DisplayedLinkKind) => Promise<unknown>
  onClose: () => void
  /**
   * Fixes the relation and hides the selector. The breadcrumb's "add parent" already *is* the
   * choice — offering five relations there would ask the question the button just answered.
   */
  kind?: DisplayedLinkKind
}

/**
 * Picks the other end of a relation, and what the relation is.
 *
 * The relation is chosen *first* and the card second, because the sentence reads that way — "this
 * card **blocks** …" — and because the same card is a different fact depending on which one you
 * picked. All five readings are offered, inverses included: choosing "blocked by" writes `blocks` on
 * the card you picked (see `cardLinks.ts`'s `linkWrite`), so the storage rule holds without the user
 * having to know it and open the other card to express the obvious.
 *
 * Only the loaded board's cards are candidates. A cross-board link is representable and *displays*,
 * but creating one would mean searching boards that aren't loaded — deliberately out of scope here.
 */
export function CardLinkPicker({
  candidates,
  onPick,
  onClose,
  kind: fixedKind,
}: CardLinkPickerProps) {
  const { t } = useTranslation('board')
  const [pickedKind, setPickedKind] = useState<DisplayedLinkKind>('relates')
  const kind = fixedKind ?? pickedKind
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates.slice(0, 50)
    return candidates
      .filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (cardIdentifier(c) ?? '').toLowerCase().includes(q)
      )
      .slice(0, 50)
  }, [candidates, query])

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
    <div
      className="mt-1.5 rounded border border-border bg-popover p-1.5 shadow-md"
      data-testid="card-link-picker"
    >
      {!fixedKind && (
        <NativeSelect
          value={kind}
          disabled={pending}
          onChange={(e) => setPickedKind(e.target.value as DisplayedLinkKind)}
          aria-label={t('card.links.kindLabel')}
          className="mb-1.5 h-7 text-xs"
          data-testid="card-link-kind"
        >
          {LINK_KIND_ORDER.map((value) => (
            <option key={value} value={value}>
              {t(`card.links.kind.${value}`)}
            </option>
          ))}
        </NativeSelect>
      )}

      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        placeholder={t('card.links.searchPlaceholder')}
        disabled={pending}
        inputSize="sm"
        className="mb-1.5"
        data-testid="card-link-search"
      />

      <div className="max-h-52 overflow-y-auto">
        {matches.map((candidate) => {
          const identifier = cardIdentifier(candidate)
          return (
            <button
              key={candidate.id}
              type="button"
              disabled={pending}
              onClick={() => void pick(candidate)}
              data-testid={`card-link-option-${candidate.id}`}
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-foreground hover:enabled:bg-accent"
            >
              <CardKindIcon kind={candidate.kind} />
              {identifier && (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {identifier}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
            </button>
          )
        })}

        {matches.length === 0 && (
          <p
            className="px-2 py-3 text-center text-[11px] text-muted-foreground"
            data-testid="card-link-empty"
          >
            {t('card.links.noCandidates')}
          </p>
        )}
      </div>
    </div>
  )
}
