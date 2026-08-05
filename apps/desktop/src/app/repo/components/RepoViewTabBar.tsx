import { useTranslation } from '@git-manager/i18n'
import { InnerTab } from '@git-manager/components'
import { GitCommitHorizontal, FolderOpen, Kanban } from 'lucide-react'
import type { Board } from '@git-manager/git-types'
import { useFileExplorerStore } from '../../../stores/fileExplorer.store'
import { useBoardControlsStore, useBoardStore } from '../../../features/board'

interface RepoViewTabBarProps {
  repoPath: string
  isFileExplorerOpen: boolean
  isBoardOpen: boolean
  boards: Board[]
  activeBoardId: string | null
}

/**
 * Alternative to `ActionToolbar`'s Files/Board toggle buttons — a tab strip below the toolbar:
 * Graph, Files, and one tab per board. Shown instead of the toolbar buttons when
 * `appearance.viewSwitcherPosition` (or its per-repo override) is `'tabs'`; see
 * `ActionToolbar.tsx` and `RepoGraphWorkspace.tsx` for where each is gated.
 *
 * Unlike the toolbar's toggle buttons (click again to close back to the graph), these are plain
 * exclusive-selection tabs — clicking "Graph" always shows the graph, there is no "close" state.
 */
export function RepoViewTabBar({
  repoPath,
  isFileExplorerOpen,
  isBoardOpen,
  boards,
  activeBoardId,
}: RepoViewTabBarProps) {
  const { t } = useTranslation('git')
  const isGraphActive = !isFileExplorerOpen && !isBoardOpen

  function selectGraph() {
    useFileExplorerStore.getState().actions.setIsOpen(false)
    useBoardControlsStore.getState().setOpen(false)
  }

  function selectFiles() {
    useFileExplorerStore.getState().actions.setIsOpen(true)
    useBoardControlsStore.getState().setOpen(false)
  }

  function selectBoard(boardId: string) {
    useBoardControlsStore.getState().setOpen(true)
    useFileExplorerStore.getState().actions.setIsOpen(false)
    useBoardStore.getState().setActiveBoard(repoPath, boardId)
  }

  return (
    <div
      data-testid="repo-view-tab-bar"
      className="flex shrink-0 items-center border-b border-border bg-card/30 px-3"
    >
      <InnerTab active={isGraphActive} onClick={selectGraph} data-testid="repo-view-tab-graph">
        <GitCommitHorizontal className="h-3.5 w-3.5" /> {t('viewTabs.graph')}
      </InnerTab>
      <InnerTab active={isFileExplorerOpen} onClick={selectFiles} data-testid="repo-view-tab-files">
        <FolderOpen className="h-3.5 w-3.5" /> {t('toolbar.files')}
      </InnerTab>
      {/* A closed sprint is an archive, not a place to work — it keeps a tab only while it is the
          one being viewed, and is otherwise reached through the board page's own picker. */}
      {boards
        .filter((board) => !board.closedAt || board.id === activeBoardId)
        .map((board) => (
          <InnerTab
            key={board.id}
            active={isBoardOpen && activeBoardId === board.id}
            onClick={() => selectBoard(board.id)}
            data-testid={`repo-view-tab-board-${board.id}`}
          >
            <Kanban className="h-3.5 w-3.5" /> {board.name}
          </InnerTab>
        ))}
    </div>
  )
}
