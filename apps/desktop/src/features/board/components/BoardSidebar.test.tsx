import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard, makeBoardData } from '../test/boardFactories'
import { useBoardControlsStore } from '../stores/boardControls.store'
import { useBoardDialogsStore } from '../stores/boardDialogs.store'
import { BoardSidebar } from './BoardSidebar'

const { useBoardData } = vi.hoisted(() => ({ useBoardData: vi.fn() }))
vi.mock('../hooks/useBoardData', () => ({ useBoardData }))

beforeEach(() => {
  vi.clearAllMocks()
  useBoardControlsStore.getState().reset()
  useBoardDialogsStore.getState().reset()
})

describe('BoardSidebar', () => {
  it('lists every open board, newest first', () => {
    useBoardData.mockReturnValue(
      makeBoardData({
        boards: [
          makeBoard({ id: 'b1', name: 'Sprint 12', createdAt: '2026-07-01T00:00:00.000Z' }),
          makeBoard({ id: 'b2', name: 'Sprint 13', createdAt: '2026-08-01T00:00:00.000Z' }),
        ],
        activeBoard: makeBoard({ id: 'b1', name: 'Sprint 12' }),
      })
    )
    render(<BoardSidebar repoPath="/repo" />)

    const rows = screen
      .getAllByRole('button')
      .filter((b) => b.dataset.testid?.startsWith('board-sidebar-item-'))
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'board-sidebar-item-b2',
      'board-sidebar-item-b1',
    ])
  })

  it('marks the board on screen as the current one', () => {
    useBoardData.mockReturnValue(makeBoardData({ boards: [makeBoard()], activeBoard: makeBoard() }))
    render(<BoardSidebar repoPath="/repo" />)

    expect(screen.getByTestId('board-sidebar-item-b1')).toHaveAttribute('aria-current', 'page')
  })

  it('switches board on a click', async () => {
    const setActiveBoard = vi.fn()
    useBoardData.mockReturnValue(
      makeBoardData({
        boards: [makeBoard(), makeBoard({ id: 'b2', name: 'Backlog' })],
        activeBoard: makeBoard(),
        setActiveBoard,
      })
    )
    const user = userEvent.setup()
    render(<BoardSidebar repoPath="/repo" />)

    await user.click(screen.getByTestId('board-sidebar-item-b2'))
    expect(setActiveBoard).toHaveBeenCalledWith('b2')
  })

  it('starts a new board through the dialog store', async () => {
    useBoardData.mockReturnValue(makeBoardData({ boards: [], activeBoard: null }))
    const user = userEvent.setup()
    render(<BoardSidebar repoPath="/repo" />)

    await user.click(screen.getByTestId('create-board-button'))
    expect(useBoardDialogsStore.getState().openDialog).toBe('createBoard')
  })

  it('says there is no board yet, but only once it knows', () => {
    useBoardData.mockReturnValue(
      makeBoardData({ boards: [], activeBoard: null, boardsLoading: true })
    )
    const { rerender } = render(<BoardSidebar repoPath="/repo" />)
    expect(screen.queryByTestId('board-sidebar-empty')).not.toBeInTheDocument()

    useBoardData.mockReturnValue(makeBoardData({ boards: [], activeBoard: null }))
    rerender(<BoardSidebar repoPath="/repo" />)
    expect(screen.getByTestId('board-sidebar-empty')).toBeInTheDocument()
  })

  /**
   * The panel's field narrows the *board list*, which is what the panel holds. Finding a ticket is
   * the toolbar's search (⌘F), across every board — so neither control narrows something it doesn't
   * sit next to.
   */
  it('filters the board list by name, and marks what matched', async () => {
    const user = userEvent.setup()
    const sprint = makeBoard({ id: 'b1', name: 'Sprint 12' })
    const backlog = makeBoard({ id: 'b2', name: 'Backlog', createdAt: '2026-01-02T00:00:00.000Z' })
    useBoardData.mockReturnValue(makeBoardData({ boards: [sprint, backlog], activeBoard: sprint }))
    const { container } = render(<BoardSidebar repoPath="/repo" />)

    await user.type(screen.getByTestId('board-filter-input'), 'back')

    expect(screen.getByTestId('board-sidebar-item-b2')).toBeInTheDocument()
    expect(screen.queryByTestId('board-sidebar-item-b1')).not.toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('mark')).map((m) => m.textContent)).toEqual([
      'Back',
    ])
  })

  /**
   * Including the board on screen. It is kept listed against the closed/deleted toggles below —
   * those hide *kinds* of board — but a filter that always kept one row would be lying about what
   * matched.
   */
  it('lets the filter take even the active board off the list', async () => {
    const user = userEvent.setup()
    const sprint = makeBoard({ id: 'b1', name: 'Sprint 12' })
    useBoardData.mockReturnValue(makeBoardData({ boards: [sprint], activeBoard: sprint }))
    render(<BoardSidebar repoPath="/repo" />)

    await user.type(screen.getByTestId('board-filter-input'), 'zzz')

    expect(screen.queryByTestId('board-sidebar-item-b1')).not.toBeInTheDocument()
  })

  /** The board being viewed is always listed, so it doesn't vanish from under the user the moment
   * they close or delete it. */
  it('keeps the active board listed even when its own filter is off', () => {
    const closed = makeBoard({ id: 'b0', name: 'Sprint 11', closedAt: '2026-08-01T00:00:00.000Z' })
    useBoardData.mockReturnValue(makeBoardData({ boards: [closed], activeBoard: closed }))
    render(<BoardSidebar repoPath="/repo" />)

    expect(screen.getByTestId('board-sidebar-item-b0')).toBeInTheDocument()
  })

  it('surfaces boards recoverable from the disaster-recovery mirror', () => {
    useBoardData.mockReturnValue(
      makeBoardData({ boards: [], activeBoard: null, recoverableBoards: [makeBoard({ id: 'b1' })] })
    )
    render(<BoardSidebar repoPath="/repo" />)

    expect(screen.getByTestId('recoverable-boards-banner')).toBeInTheDocument()
  })

  it('shows no recovery banner when there is nothing to recover', () => {
    useBoardData.mockReturnValue(makeBoardData({ boards: [], activeBoard: null }))
    render(<BoardSidebar repoPath="/repo" />)

    expect(screen.queryByTestId('recoverable-boards-banner')).not.toBeInTheDocument()
  })
})
