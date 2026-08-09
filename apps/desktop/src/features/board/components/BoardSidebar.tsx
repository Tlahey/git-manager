import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { Button, Checkbox } from '@git-manager/ui'
import { Kanban, Plus } from 'lucide-react'
import type { Board } from '@git-manager/git-types'
import { useBoardData } from '../hooks/useBoardData'
import { useBoardControlsStore } from '../stores/boardControls.store'
import { useBoardDialogsStore } from '../stores/boardDialogs.store'

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

  const showClosed = useBoardControlsStore((s) => s.showClosed)
  const setShowClosed = useBoardControlsStore((s) => s.setShowClosed)
  const showDeleted = useBoardControlsStore((s) => s.showDeleted)
  const setShowDeleted = useBoardControlsStore((s) => s.setShowDeleted)
  const openDialog = useBoardDialogsStore((s) => s.open)

  /**
   * Closed sprints and deleted boards stay listed but out of the way, each behind its own toggle.
   * The one currently open is always shown, so a board doesn't vanish from under the user the moment
   * they close or delete it.
   *
   * Ordered newest first: the board you want is nearly always the one that started last, and
   * alphabetical ordering puts "Sprint 10" above "Sprint 9".
   */
  const visibleBoards = useMemo(() => {
    const shown = boards.filter(
      (b) =>
        b.id === activeBoard?.id || ((showClosed || !b.closedAt) && (showDeleted || !b.deletedAt))
    )
    return [...shown].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [boards, activeBoard?.id, showClosed, showDeleted])

  return (
    <div
      data-testid="board-sidebar"
      className="flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-sidebar-border px-2">
        <span className="select-none text-[10px] font-bold uppercase tracking-widest text-sidebar-muted-foreground/60">
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

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
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
  onSelect,
}: {
  board: Board
  active: boolean
  subtitle: string
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
        <span className="truncate text-xs font-medium">{board.name}</span>
        <span className="truncate text-[10px] leading-tight text-sidebar-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  )
}
