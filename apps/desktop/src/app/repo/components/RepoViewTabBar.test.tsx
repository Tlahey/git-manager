import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Board } from '@git-manager/git-types'
import { makeBoard } from '../../../test/boardFactories'
import { RepoViewTabBar } from './RepoViewTabBar'
import { useFileExplorerStore } from '../../../stores/fileExplorer.store'
import { useBoardControlsStore } from '../../../stores/boardControls.store'
import { useBoardStore } from '../../../stores/board.store'

const INITIAL_EXPLORER = useFileExplorerStore.getState()
const path = '/repo'

function board(overrides: Partial<Board> = {}): Board {
  return makeBoard({ columns: [], ...overrides })
}

beforeEach(() => {
  useFileExplorerStore.setState(INITIAL_EXPLORER, true)
  useBoardControlsStore.setState({ isOpen: false })
  useBoardStore.setState({ activeBoardIdByRepo: {}, collapsedColumns: {} })
})

describe('RepoViewTabBar', () => {
  it('shows Graph and Files tabs plus one tab per board', () => {
    render(
      <RepoViewTabBar
        repoPath={path}
        isFileExplorerOpen={false}
        isBoardOpen={false}
        boards={[board(), board({ id: 'b2', name: 'Backlog' })]}
        activeBoardId={null}
      />
    )
    expect(screen.getByTestId('repo-view-tab-graph')).toBeInTheDocument()
    expect(screen.getByTestId('repo-view-tab-files')).toBeInTheDocument()
    expect(screen.getByText('Sprint 12')).toBeInTheDocument()
    expect(screen.getByText('Backlog')).toBeInTheDocument()
  })

  it('highlights Graph as active when neither file explorer nor board is open', () => {
    render(
      <RepoViewTabBar
        repoPath={path}
        isFileExplorerOpen={false}
        isBoardOpen={false}
        boards={[]}
        activeBoardId={null}
      />
    )
    expect(screen.getByTestId('repo-view-tab-graph').className).toContain('border-primary')
    expect(screen.getByTestId('repo-view-tab-files').className).not.toContain('border-primary')
  })

  it('highlights the active board tab, not Files or Graph', () => {
    render(
      <RepoViewTabBar
        repoPath={path}
        isFileExplorerOpen={false}
        isBoardOpen
        boards={[board()]}
        activeBoardId="b1"
      />
    )
    expect(screen.getByTestId('repo-view-tab-board-b1').className).toContain('border-primary')
    expect(screen.getByTestId('repo-view-tab-graph').className).not.toContain('border-primary')
  })

  it('clicking Files opens the file explorer and closes the board', async () => {
    useBoardControlsStore.setState({ isOpen: true })
    const user = userEvent.setup()
    render(
      <RepoViewTabBar
        repoPath={path}
        isFileExplorerOpen={false}
        isBoardOpen
        boards={[]}
        activeBoardId={null}
      />
    )
    await user.click(screen.getByTestId('repo-view-tab-files'))
    expect(useFileExplorerStore.getState().isOpen).toBe(true)
    expect(useBoardControlsStore.getState().isOpen).toBe(false)
  })

  it('clicking a board tab opens the board, closes the file explorer, and sets it active', async () => {
    useFileExplorerStore.setState({ isOpen: true })
    const user = userEvent.setup()
    render(
      <RepoViewTabBar
        repoPath={path}
        isFileExplorerOpen
        isBoardOpen={false}
        boards={[board({ id: 'b2' })]}
        activeBoardId={null}
      />
    )
    await user.click(screen.getByTestId('repo-view-tab-board-b2'))
    expect(useBoardControlsStore.getState().isOpen).toBe(true)
    expect(useFileExplorerStore.getState().isOpen).toBe(false)
    expect(useBoardStore.getState().activeBoardIdByRepo[path]).toBe('b2')
  })

  it('leaves a closed sprint out of the tabs', () => {
    render(
      <RepoViewTabBar
        repoPath={path}
        isFileExplorerOpen={false}
        isBoardOpen={false}
        boards={[board(), board({ id: 'b2', name: 'Sprint 11', closedAt: '2026-08-01T00:00:00Z' })]}
        activeBoardId={null}
      />
    )
    expect(screen.getByText('Sprint 12')).toBeInTheDocument()
    expect(screen.queryByText('Sprint 11')).not.toBeInTheDocument()
  })

  it('keeps a closed sprint’s tab while it is the one being viewed', () => {
    render(
      <RepoViewTabBar
        repoPath={path}
        isFileExplorerOpen={false}
        isBoardOpen
        boards={[board({ id: 'b2', name: 'Sprint 11', closedAt: '2026-08-01T00:00:00Z' })]}
        activeBoardId="b2"
      />
    )
    expect(screen.getByText('Sprint 11')).toBeInTheDocument()
  })

  it('clicking Graph closes both the file explorer and the board', async () => {
    useFileExplorerStore.setState({ isOpen: true })
    useBoardControlsStore.setState({ isOpen: false })
    const user = userEvent.setup()
    render(
      <RepoViewTabBar
        repoPath={path}
        isFileExplorerOpen
        isBoardOpen={false}
        boards={[]}
        activeBoardId={null}
      />
    )
    await user.click(screen.getByTestId('repo-view-tab-graph'))
    expect(useFileExplorerStore.getState().isOpen).toBe(false)
    expect(useBoardControlsStore.getState().isOpen).toBe(false)
  })
})
