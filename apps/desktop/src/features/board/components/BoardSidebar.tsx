import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Checkbox, Input } from '@git-manager/ui'
import { Kanban, Plus, Search, X } from 'lucide-react'
import type { Board } from '@git-manager/git-types'
import { highlightMatch } from '@git-manager/components'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardControlsStore } from '../stores/boardControls.store'
import { useBoardDialogsStore } from '../stores/boardDialogs.store'
import { useSidebarSearchStore } from '../../../stores/sidebarSearch.store'

interface BoardSidebarProps {
  repoPath: string
}

/**
 * The board view's left panel: every board of the repo, one row each, and the way to start another.
 *
 * It stands where the branch sidebar stands on the graph view — the panel is scoped to the view now,
 * so a repo's branches are not offered while reading a Kanban and a repo's boards are not offered
 * while reading a commit graph. What used to be a popover picker in the board's own header is a
 * standing list here: the picker had to be opened to answer "which boards are there", which is the
 * question a panel answers by existing.
 *
 * `useBoardData` is called here as well as in `BoardPage` and `BoardToolbar`; the underlying reads
 * are SWR, so the three share one fetch.
 */
export function BoardSidebar({ repoPath }: BoardSidebarProps) {
  const { t } = useTranslation('board')
  const { boards, boardsLoading, activeBoard, setActiveBoard } = useBoardData(repoPath)

  const boardFilter = useBoardControlsStore((s) => s.boardFilter)
  const setBoardFilter = useBoardControlsStore((s) => s.setBoardFilter)
  const showClosed = useBoardControlsStore((s) => s.showClosed)
  const setShowClosed = useBoardControlsStore((s) => s.setShowClosed)
  const showDeleted = useBoardControlsStore((s) => s.showDeleted)
  const setShowDeleted = useBoardControlsStore((s) => s.setShowDeleted)
  const openDialog = useBoardDialogsStore((s) => s.open)

  // ⌘F on this view, and ⌥⌘F everywhere: both raise the *left panel's* filter. On the graph that is
  // the branch list's field, on the files view the tree's, and here this one.
  const focusToken = useSidebarSearchStore((s) => s.focusToken)
  const searchInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusToken === 0) return
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [focusToken])

  /**
   * Closed sprints and deleted boards stay listed but out of the way, each behind its own toggle.
   * The one currently open is always shown, so a board doesn't vanish from under the user the moment
   * they close or delete it.
   *
   * Ordered newest first: the board you want is nearly always the one that started last, and
   * alphabetical ordering puts "Sprint 10" above "Sprint 9".
   */
  const visibleBoards = useMemo(() => {
    const needle = boardFilter.trim().toLowerCase()
    const shown = boards.filter((b) => {
      // The filter applies to the open board as well — it is the one thing that can take it off the
      // list, because a filter that always kept one row would be lying about what matched.
      if (needle && !b.name.toLowerCase().includes(needle)) return false
      return (
        b.id === activeBoard?.id || ((showClosed || !b.closedAt) && (showDeleted || !b.deletedAt))
      )
    })
    return [...shown].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [boards, activeBoard?.id, boardFilter, showClosed, showDeleted])

  return (
    <div
      data-testid="board-sidebar"
      className="flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-sidebar-border px-2">
        <span className="text-[10px] font-bold tracking-widest text-sidebar-muted-foreground/60 uppercase select-none">
          {t('sidebar.title')}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-sidebar-muted-foreground"
          onClick={() => openDialog('createBoard')}
          title={t('page.newBoard')}
          aria-label={t('page.newBoard')}
          data-testid="create-board-button"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters the list below it, and only that: boards by name. Finding a *ticket* is the
          toolbar's search (⌘F), which looks across every board — so neither control narrows
          something it doesn't sit next to. */}
      <div className="shrink-0 border-b border-sidebar-border px-2 py-1.5">
        <Input
          ref={searchInputRef}
          variant="chrome"
          type="text"
          value={boardFilter}
          onChange={(e) => setBoardFilter(e.target.value)}
          placeholder={t('sidebar.filterPlaceholder')}
          aria-label={t('sidebar.filterPlaceholder')}
          className="h-7 text-xs shadow-none"
          startIcon={<Search className="h-3.5 w-3.5" />}
          endIcon={
            boardFilter ? (
              <button
                onClick={() => setBoardFilter('')}
                aria-label={t('git:sidebar.clearFilter')}
                className="flex h-4 w-4 cursor-pointer items-center justify-center rounded text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : undefined
          }
          data-testid="board-filter-input"
        />
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto py-1">
        {/* Nothing at all while the list is still loading: "No boards yet" is an answer, and it would
            be the wrong one for the second it takes to find out. */}
        {boardsLoading ? null : visibleBoards.length === 0 ? (
          <p
            className="px-3 py-4 text-center text-xs text-sidebar-muted-foreground"
            data-testid="board-sidebar-empty"
          >
            {t('page.noBoards')}
          </p>
        ) : (
          visibleBoards.map((board) => (
            <BoardRow
              key={board.id}
              board={board}
              active={board.id === activeBoard?.id}
              onSelect={() => setActiveBoard(board.id)}
              query={boardFilter}
              subtitle={`${board.source === 'remote' ? t('backend.remote') : t('backend.local')}${
                board.closedAt ? ` · ${t('sprint.closedBadge')}` : ''
              }${board.deletedAt ? ` · ${t('deleteBoard.deletedBadge')}` : ''}`}
            />
          ))
        )}
      </div>

      <div className="shrink-0 space-y-1.5 border-t border-sidebar-border px-3 py-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-sidebar-muted-foreground">
          <Checkbox
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            data-testid="board-show-closed"
          />
          {t('sprint.showClosed')}
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-sidebar-muted-foreground">
          <Checkbox
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            data-testid="board-show-deleted"
          />
          {t('deleteBoard.showDeleted')}
        </label>
      </div>
    </div>
  )
}

function BoardRow({
  board,
  active,
  subtitle,
  query,
  onSelect,
}: {
  board: Board
  active: boolean
  subtitle: string
  /** The panel's filter, marked inside the name so a row says why it survived it. */
  query: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      data-testid={`board-sidebar-item-${board.id}`}
      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors ${
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
      }`}
    >
      <Kanban className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium">{highlightMatch(board.name, query)}</span>
        <span className="truncate text-[10px] leading-tight text-sidebar-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  )
}
