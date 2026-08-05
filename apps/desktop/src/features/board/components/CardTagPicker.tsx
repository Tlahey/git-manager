import { useMemo, useRef, useState, useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input } from '@git-manager/ui'
import { Check, Plus } from 'lucide-react'
import type { BoardTag } from '@git-manager/git-types'
import { tagIdFromName } from '../lib/boardDefaults'

interface CardTagPickerProps {
  /** The board's palette — the candidates. */
  tags: BoardTag[]
  selectedIds: string[]
  onToggle: (tagId: string) => void
  /**
   * Adds a new tag to the **board** *and* puts it on this card.
   *
   * Both halves belong to the caller because the order matters: on a local board a card's revision
   * is the board's own, so writing the palette invalidates it and the assignment has to be built
   * from a re-read card. Doing the second half here, with the props this component was rendered
   * with, is exactly the stale write that fails.
   */
  onCreate: (name: string) => Promise<BoardTag | null>
  onClose: () => void
}

/**
 * Assigns the card's tags, and lets it invent one.
 *
 * A tag typed here is created on the *board*, not on the card: that is what makes it show up as an
 * existing option the next time, instead of every card growing its own near-duplicate in a different
 * colour. Defining the palette up front in the board settings therefore stays possible but stops
 * being a prerequisite for tagging anything.
 */
export function CardTagPicker({
  tags,
  selectedIds,
  onToggle,
  onCreate,
  onClose,
}: CardTagPickerProps) {
  const { t } = useTranslation('board')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tags
    return tags.filter((tag) => tag.name.toLowerCase().includes(q))
  }, [tags, query])

  const typed = query.trim()
  // Matched on the name *and* on the slug: the slug catches "Front End" against an existing
  // "front-end", and the name catches a tag that was renamed in the board settings and whose id no
  // longer resembles what it is called.
  const showCreate =
    typed.length > 0 &&
    !tags.some(
      (tag) =>
        tag.name.toLowerCase() === typed.toLowerCase() || tag.id === tagIdFromName(typed)
    )

  async function create() {
    if (!typed || pending) return
    setPending(true)
    try {
      // `onCreate` also assigns — see its doc comment. Toggling here as well would patch the card
      // with the revision this render captured, which the palette write has already invalidated.
      await onCreate(typed)
      setQuery('')
    } catch {
      // Reported by the action layer (`reportWriteFailures`); swallowed here so the rejection isn't
      // an unhandled one, and so the dialog stays open on what the user typed.
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      className="mt-1.5 rounded border border-border bg-popover p-1.5 shadow-md"
      data-testid="card-tag-picker"
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && showCreate) void create()
        }}
        placeholder={t('card.tags.searchPlaceholder')}
        disabled={pending}
        inputSize="sm"
        className="mb-1.5"
        data-testid="card-tag-search"
      />

      <div className="max-h-52 overflow-y-auto">
        {matches.map((tag) => {
          const selected = selectedIds.includes(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              disabled={pending}
              onClick={() => onToggle(tag.id)}
              aria-pressed={selected}
              data-testid={`card-tag-option-${tag.id}`}
              className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-foreground hover:enabled:bg-accent"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              {selected && <Check className="h-3 w-3 shrink-0 text-primary" />}
            </button>
          )
        })}

        {showCreate && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void create()}
            data-testid="card-tag-create"
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-foreground hover:enabled:bg-accent"
          >
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {t('card.tags.create', { name: typed })}
            </span>
          </button>
        )}

        {matches.length === 0 && !showCreate && (
          <p
            className="px-2 py-3 text-center text-[11px] text-muted-foreground"
            data-testid="card-tag-empty"
          >
            {t('card.tags.empty')}
          </p>
        )}
      </div>
    </div>
  )
}
