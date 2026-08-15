import { useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  Spinner,
} from '@git-manager/ui'
import { highlightMatch } from '@git-manager/components'
import { Archive } from 'lucide-react'
import { useAllBoardCards } from '../hooks/useAllBoardCards'
import { useBoardCatalog } from '../hooks/useBoardCatalog'
import { useBoardBackends } from '../hooks/useBoardBackends'
import { useBoardDialogsStore } from '../stores/boardDialogs.store'
import { searchCards } from '../lib/searchCards'
import { cardIdentifier } from '../lib/cardMeta'
import { CardKindIcon } from './CardKindIcon'

interface BoardSearchDialogProps {
  repoPath: string
}

/**
 * The **global** ticket search: every card of every board of this repository, found by identifier,
 * title, assignee, board name or description, and opened where it lives.
 *
 * Two searches on this view, answering two questions. The left panel's field narrows *the board on
 * screen* — "which of these am I looking for". This one starts from nothing but the ticket — "where
 * is GM-7" has no reason to begin by asking which board GM-7 is on, and answering it by making the
 * user try each board in turn is the thing this replaces.
 *
 * Selecting a result **switches to the card's board and opens it**, in that order: the card dialog
 * resolves its id out of the open board's live card list (see `boardDialogs.store`), so opening it
 * without switching first would render a dialog on an id the board it is over has never heard of. A
 * card whose board is no longer in the list — deleted between the sweep and the click — leaves the
 * active board alone rather than pointing it at a board that isn't there.
 *
 * cmdk's own filtering is off (`shouldFilter={false}`): the ranking is `searchCards`', and cmdk
 * would reorder the rows by its own score on top of it.
 */
export function BoardSearchDialog({ repoPath }: BoardSearchDialogProps) {
  const { t } = useTranslation('board')
  const [query, setQuery] = useState('')

  const isOpen = useBoardDialogsStore((s) => s.isOpen('globalSearch'))
  const setOpen = useBoardDialogsStore((s) => s.setOpen)
  const setCardDialog = useBoardDialogsStore((s) => s.setCardDialog)

  const { remoteBackend } = useBoardBackends(repoPath)
  const { boards, setActiveBoard } = useBoardCatalog(repoPath, remoteBackend)
  const { cards, loading, unreadable } = useAllBoardCards(repoPath, isOpen)

  const results = useMemo(() => searchCards(cards, query), [cards, query])

  function openCard(boardId: string, cardId: string) {
    // Only when the board is still there. `setActiveBoard` writes the id into the persisted
    // selection, so pointing it at a board that has since been deleted would leave the view with no
    // board on screen and no obvious way to say why.
    if (boards.some((b) => b.id === boardId)) setActiveBoard(boardId)
    setOpen('globalSearch', false)
    setCardDialog({ mode: 'edit', cardId })
    setQuery('')
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(next) => {
        setOpen('globalSearch', next)
        if (!next) setQuery('')
      }}
      title={t('search.title')}
      shouldFilter={false}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('search.placeholder')}
        data-testid="board-search-dialog-input"
      />
      <CommandList data-testid="board-search-dialog">
        {/* Empty is three different states, and saying so is the point: still reading the boards,
            nothing typed yet, or nothing found. A single "no results" would claim the third while
            the first is true. */}
        <CommandEmpty>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner className="h-3.5 w-3.5" />
              {t('search.loading')}
            </span>
          ) : query.trim() === '' ? (
            t('search.hint')
          ) : (
            t('search.noResults')
          )}
        </CommandEmpty>

        {/* Stated before the results, not after: a sweep that could not read a board is answering a
            narrower question than the user asked, and finding that out below the list they already
            trusted is finding out too late. */}
        {unreadable.length > 0 && (
          <p
            className="px-3 py-2 text-[11px] text-tone-warning"
            data-testid="board-search-unreadable"
          >
            {t('search.unreadable', {
              count: unreadable.length,
              boards: unreadable.map((b) => b.name).join(', '),
            })}
          </p>
        )}

        {results.map(({ card, board, descriptionSnippet }) => {
          const identifier = cardIdentifier(card)
          const column = board.columns.find((c) => c.id === card.columnId)
          return (
            <CommandItem
              key={`${board.id}:${card.id}`}
              value={`${board.id}:${card.id}`}
              onSelect={() => openCard(board.id, card.id)}
              data-testid={`board-search-result-${card.id}`}
              className="flex-col items-stretch gap-0.5"
            >
              <span className="flex items-center gap-2">
                <CardKindIcon kind={card.kind} />
                {identifier && (
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {highlightMatch(identifier, query)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{highlightMatch(card.title, query)}</span>
                {card.archivedAt && (
                  <Archive
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-label={t('search.archived')}
                  />
                )}
                {/* The board is what tells two identically-titled tickets apart, so it is never
                    truncated away: the column and the assignee are, being the details. */}
                <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-[11px] text-muted-foreground">
                  {card.assignee && <span className="max-w-24 truncate">{card.assignee}</span>}
                  {column && <span className="max-w-24 truncate">{column.name}</span>}
                  <span className="text-foreground">{highlightMatch(board.name, query)}</span>
                </span>
              </span>
              {/* Only rendered when nothing else on the row explains the match — see
                  `CardSearchResult.descriptionSnippet`. */}
              {descriptionSnippet && (
                <span className="truncate pl-6 text-[11px] text-muted-foreground">
                  {highlightMatch(descriptionSnippet, query)}
                </span>
              )}
            </CommandItem>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
