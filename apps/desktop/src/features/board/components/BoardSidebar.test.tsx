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

    const rows = screen.getAllByRole('button').filter((b) => b.dataset.testid?.startsWith('board-sidebar-item-'))
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'board-sidebar-item-b2',
      'board-sidebar-item-b1',
    ])
  })

  it('marks the board on screen as the current one', () => {
    useBoardData.mockReturnValue(
      makeBoardData({ boards: [makeBoard()], activeBoard: makeBoard() })
    )
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
    useBoardData.mockReturnValue(makeBoardData({ boards: [], activeBoard: null, boardsLoading: true }))
    const { rerender } = render(<BoardSidebar repoPath="/repo" />)
    expect(screen.queryByTestId('board-sidebar-empty')).not.toBeInTheDocument()

    useBoardData.mockReturnValue(makeBoardData({ boards: [], activeBoard: null }))
    rerender(<BoardSidebar repoPath="/repo" />)
    expect(screen.getByTestId('board-sidebar-empty')).toBeInTheDocument()
  })

  /** The board being viewed is always listed, so it doesn't vanish from under the user the moment
   * they close or delete it. */
  it('keeps the active board listed even when its own filter is off', () => {
    const closed = makeBoard({ id: 'b0', name: 'Sprint 11', closedAt: '2026-08-01T00:00:00.000Z' })
    useBoardData.mockReturnValue(makeBoardData({ boards: [closed], activeBoard: closed }))
    render(<BoardSidebar repoPath="/repo" />)

    expect(screen.getByTestId('board-sidebar-item-b0')).toBeInTheDocument()
  })
})
