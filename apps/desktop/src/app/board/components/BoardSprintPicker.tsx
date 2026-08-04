import { useMemo, useState } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Input, Popover, PopoverContent, PopoverTrigger } from '@git-manager/ui'
import { ChevronDown, Kanban, Search } from 'lucide-react'
import type { Board } from '@git-manager/git-types'

interface BoardSprintPickerProps {
  boards: Board[]
  activeBoard: Board | null
  onSelect: (boardId: string) => void
}

/**
 * Picks the sprint on screen.
 *
 * Shaped like `RepoSelector` — a popover with a search field over rows carrying a bold name and a
 * muted sub-line — because that is the picker this app already teaches at the top of every window,
 * and a board list is the same kind of choice. The sub-line is where a sprint's backend and its
 * closed state live, which a single-line `<option>` had nowhere to put.
 *
 * Ordered by creation date, **newest first**: the sprint you want is nearly always the one that
 * started last, and alphabetical ordering puts "Sprint 10" above "Sprint 9".
 */
export function BoardSprintPicker({ boards, activeBoard, onSelect }: BoardSprintPickerProps) {
  const { t } = useTranslation('board')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const ordered = useMemo(
    () => [...boards].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [boards]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ordered
    return ordered.filter((board) => board.name.toLowerCase().includes(q))
  }, [ordered, query])

  function select(boardId: string) {
    onSelect(boardId)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="board-switcher"
          title={activeBoard?.name ?? t('sprint.picker.select')}
          className="flex h-7 w-56 cursor-pointer items-center gap-1.5 rounded border border-border px-2 text-xs transition-colors hover:bg-accent"
        >
          <Kanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left font-medium text-foreground">
            {activeBoard?.name ?? t('sprint.picker.select')}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 overflow-hidden p-0">
        <div className="border-b border-border p-1.5">
          <Input
            variant="ghost"
            inputSize="sm"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sprint.picker.searchPlaceholder')}
            startIcon={<Search className="h-3.5 w-3.5 text-muted-foreground" />}
            data-testid="board-switcher-search"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p
              className="px-2 py-4 text-center text-xs text-muted-foreground"
              data-testid="board-switcher-empty"
            >
              {t('sprint.picker.empty')}
            </p>
          ) : (
            filtered.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => select(board.id)}
                data-testid={`board-switcher-option-${board.id}`}
                className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent ${
                  board.id === activeBoard?.id ? 'bg-accent/60' : ''
                }`}
              >
                <Kanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium text-foreground">{board.name}</span>
                  <span className="truncate text-[10px] leading-tight text-muted-foreground">
                    {board.source === 'remote' ? t('backend.remote') : t('backend.local')}
                    {board.closedAt ? ` · ${t('sprint.closedBadge')}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
