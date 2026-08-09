import { useTranslation } from '@git-manager/i18n'
import { InnerTab } from '@git-manager/components'
import { GitCommitHorizontal, FolderOpen, Kanban } from 'lucide-react'
import type { Board } from '@git-manager/git-types'
import { useRepoViewStore } from '../../../stores/repoView.store'
import { useBoardStore } from '../../../features/board'

interface RepoViewTabBarProps {
  repoPath: string
  boards: Board[]
  activeBoardId: string | null
}

/**
 * The repo tab's own tab strip: Graph, Files, and one tab per board.
 *
 * This is the *only* view switcher. There used to be a second one — two toggle buttons in the
 * toolbar, chosen by an `appearance.viewSwitcherPosition` setting — which was a reasonable offer
 * while a view was a panel you opened over the graph. It is not one now that switching view changes
 * the toolbar and the left panel with it: that is a navigation, and a navigation gets tabs.
 *
 * Plain exclusive-selection tabs, with no "close" state: clicking Graph shows the graph.
 */
export function RepoViewTabBar({ repoPath, boards, activeBoardId }: RepoViewTabBarProps) {
  const { t } = useTranslation('git')
  const view = useRepoViewStore((s) => s.view)
  const setView = useRepoViewStore((s) => s.setView)

  function selectBoard(boardId: string) {
    setView('board')
    useBoardStore.getState().setActiveBoard(repoPath, boardId)
  }

  return (
    <div
      data-testid="repo-view-tab-bar"
      className="border-border bg-card/30 flex shrink-0 items-center border-b px-3"
    >
      <InnerTab
        active={view === 'graph'}
        onClick={() => setView('graph')}
        data-testid="repo-view-tab-graph"
      >
        <GitCommitHorizontal className="h-3.5 w-3.5" /> {t('viewTabs.graph')}
      </InnerTab>
      <InnerTab
        active={view === 'files'}
        onClick={() => setView('files')}
        data-testid="repo-view-tab-files"
      >
        <FolderOpen className="h-3.5 w-3.5" /> {t('toolbar.files')}
      </InnerTab>
      {/* A repo with no board still needs a way into the board view, or the only place that offers
          to create one is unreachable. */}
      {boards.length === 0 ? (
        <InnerTab
          active={view === 'board'}
          onClick={() => setView('board')}
          data-testid="repo-view-tab-board"
        >
          <Kanban className="h-3.5 w-3.5" /> {t('toolbar.board')}
        </InnerTab>
      ) : (
        // A closed sprint is an archive, not a place to work — it keeps a tab only while it is the
        // one being viewed, and is otherwise reached through the board view's own sidebar.
        boards
          .filter((board) => !board.closedAt || board.id === activeBoardId)
          .map((board) => (
            <InnerTab
              key={board.id}
              active={view === 'board' && activeBoardId === board.id}
              onClick={() => selectBoard(board.id)}
              data-testid={`repo-view-tab-board-${board.id}`}
            >
              <Kanban className="h-3.5 w-3.5" /> {board.name}
            </InnerTab>
          ))
      )}
    </div>
  )
}
