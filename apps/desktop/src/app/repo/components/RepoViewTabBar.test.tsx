import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Board } from '@git-manager/git-types'
import { makeBoard } from '../../../features/board/test/boardFactories'
import { RepoViewTabBar } from './RepoViewTabBar'
import { useRepoViewStore } from '../../../stores/repoView.store'
import { useBoardStore } from '../../../features/board'

const path = '/repo'

function board(overrides: Partial<Board> = {}): Board {
  return makeBoard({ columns: [], ...overrides })
}

beforeEach(() => {
  useRepoViewStore.setState({ view: 'graph' })
  useBoardStore.setState({ activeBoardIdByRepo: {}, collapsedColumns: {} })
})

describe('RepoViewTabBar', () => {
  it('shows Graph and Files tabs plus one tab per board', () => {
    render(
      <RepoViewTabBar
        repoPath={path}
        boards={[board(), board({ id: 'b2', name: 'Backlog' })]}
        activeBoardId={null}
      />
    )
    expect(screen.getByTestId('repo-view-tab-graph')).toBeInTheDocument()
    expect(screen.getByTestId('repo-view-tab-files')).toBeInTheDocument()
    expect(screen.getByText('Sprint 12')).toBeInTheDocument()
    expect(screen.getByText('Backlog')).toBeInTheDocument()
  })

  it('highlights the tab of whichever view is active', () => {
    render(<RepoViewTabBar repoPath={path} boards={[]} activeBoardId={null} />)
    expect(screen.getByTestId('repo-view-tab-graph').className).toContain('border-primary')
    expect(screen.getByTestId('repo-view-tab-files').className).not.toContain('border-primary')
  })

  it('highlights the active board tab, not Files or Graph', () => {
    useRepoViewStore.setState({ view: 'board' })
    render(<RepoViewTabBar repoPath={path} boards={[board()]} activeBoardId="b1" />)

    expect(screen.getByTestId('repo-view-tab-board-b1').className).toContain('border-primary')
    expect(screen.getByTestId('repo-view-tab-graph').className).not.toContain('border-primary')
  })

  it('clicking Files switches the view', async () => {
    useRepoViewStore.setState({ view: 'board' })
    const user = userEvent.setup()
    render(<RepoViewTabBar repoPath={path} boards={[]} activeBoardId={null} />)

    await user.click(screen.getByTestId('repo-view-tab-files'))
    expect(useRepoViewStore.getState().view).toBe('files')
  })

  it('clicking a board tab switches the view and makes that board the active one', async () => {
    useRepoViewStore.setState({ view: 'files' })
    const user = userEvent.setup()
    render(<RepoViewTabBar repoPath={path} boards={[board({ id: 'b2' })]} activeBoardId={null} />)

    await user.click(screen.getByTestId('repo-view-tab-board-b2'))
    expect(useRepoViewStore.getState().view).toBe('board')
    expect(useBoardStore.getState().activeBoardIdByRepo[path]).toBe('b2')
  })

  it('leaves a closed sprint out of the tabs', () => {
    render(
      <RepoViewTabBar
        repoPath={path}
        boards={[board(), board({ id: 'b2', name: 'Sprint 11', closedAt: '2026-08-01T00:00:00Z' })]}
        activeBoardId={null}
      />
    )
    expect(screen.getByText('Sprint 12')).toBeInTheDocument()
    expect(screen.queryByText('Sprint 11')).not.toBeInTheDocument()
  })

  it('keeps a closed sprint’s tab while it is the one being viewed', () => {
    useRepoViewStore.setState({ view: 'board' })
    render(
      <RepoViewTabBar
        repoPath={path}
        boards={[board({ id: 'b2', name: 'Sprint 11', closedAt: '2026-08-01T00:00:00Z' })]}
        activeBoardId="b2"
      />
    )
    expect(screen.getByText('Sprint 11')).toBeInTheDocument()
  })

  it('clicking Graph switches back to it', async () => {
    useRepoViewStore.setState({ view: 'files' })
    const user = userEvent.setup()
    render(<RepoViewTabBar repoPath={path} boards={[]} activeBoardId={null} />)

    await user.click(screen.getByTestId('repo-view-tab-graph'))
    expect(useRepoViewStore.getState().view).toBe('graph')
  })

  /** With no board there is no board tab, and the only screen offering to create one would be
   * unreachable — so a repo with none still gets a plain "Board" tab. */
  it('offers a way into the board view for a repo with no board at all', async () => {
    const user = userEvent.setup()
    render(<RepoViewTabBar repoPath={path} boards={[]} activeBoardId={null} />)

    await user.click(screen.getByTestId('repo-view-tab-board'))
    expect(useRepoViewStore.getState().view).toBe('board')
  })
})
