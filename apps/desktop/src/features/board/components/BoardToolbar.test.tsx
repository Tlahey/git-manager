import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard, makeCard, makeBoardData } from '../test/boardFactories'
import { useBoardControlsStore } from '../stores/boardControls.store'
import { useBoardDialogsStore } from '../stores/boardDialogs.store'
import { BoardToolbar } from './BoardToolbar'

const { useBoardData } = vi.hoisted(() => ({ useBoardData: vi.fn() }))
vi.mock('../hooks/useBoardData', () => ({ useBoardData }))

function withBoard(overrides: Parameters<typeof makeBoardData>[0] = {}) {
  const board = makeBoard()
  useBoardData.mockReturnValue(
    makeBoardData({ boards: [board], activeBoard: board, cards: [], ...overrides })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useBoardControlsStore.getState().reset()
  useBoardDialogsStore.getState().reset()
  withBoard()
})

describe('BoardToolbar', () => {
  it('writes the card filter the board reads', async () => {
    const user = userEvent.setup()
    render(<BoardToolbar repoPath="/repo" />)

    await user.type(screen.getByTestId('board-search-input'), 'header')

    expect(useBoardControlsStore.getState().search).toBe('header')
  })

  /**
   * The buttons are up here and the dialogs are rendered down in the page, so what a click does is
   * write the dialog store — that store *is* the seam the split created.
   */
  it('raises a board dialog through the store rather than through the page', async () => {
    const user = userEvent.setup()
    render(<BoardToolbar repoPath="/repo" />)

    await user.click(screen.getByTestId('board-settings-button'))

    expect(useBoardDialogsStore.getState().openDialog).toBe('boardSettings')
  })

  it('starts a new card in the board’s first column', async () => {
    const user = userEvent.setup()
    render(<BoardToolbar repoPath="/repo" />)

    await user.click(screen.getByTestId('board-new-card-button'))

    expect(useBoardDialogsStore.getState().cardDialog).toEqual({
      mode: 'create',
      columnId: 'todo',
    })
  })

  /** An empty archive is not worth a permanent button, and the count is the reason to open it. */
  it('offers the archive only once a card is in it', () => {
    withBoard({ cards: [makeCard()] })
    const { rerender } = render(<BoardToolbar repoPath="/repo" />)
    expect(screen.queryByTestId('board-archived-button')).not.toBeInTheDocument()

    withBoard({ cards: [makeCard({ id: 'c2', archivedAt: '2026-08-04T00:00:00.000Z' })] })
    rerender(<BoardToolbar repoPath="/repo" />)
    expect(screen.getByTestId('board-archived-button')).toBeInTheDocument()
  })

  it('offers no editing action on a closed sprint, and none on a deleted board', () => {
    const closed = makeBoard({ closedAt: '2026-08-04T10:00:00.000Z' })
    useBoardData.mockReturnValue(makeBoardData({ boards: [closed], activeBoard: closed, cards: [] }))
    const { rerender } = render(<BoardToolbar repoPath="/repo" />)
    expect(screen.queryByTestId('board-edit-columns-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-settings-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-close-sprint-button')).not.toBeInTheDocument()

    const deleted = makeBoard({ deletedAt: '2026-08-06T00:00:00.000Z' })
    useBoardData.mockReturnValue(
      makeBoardData({ boards: [deleted], activeBoard: deleted, cards: [] })
    )
    rerender(<BoardToolbar repoPath="/repo" />)
    // …and deleting it again would destroy exactly what the first deletion chose to keep.
    expect(screen.queryByTestId('board-delete-button')).not.toBeInTheDocument()
  })

  /** A standing board — a backlog a ticket passes through on its way to a sprint — has no period to
   * close, so it is offered no way to. */
  it('offers closing only on an iteration', () => {
    const standing = makeBoard({ iteration: false })
    useBoardData.mockReturnValue(
      makeBoardData({ boards: [standing], activeBoard: standing, cards: [] })
    )
    render(<BoardToolbar repoPath="/repo" />)

    expect(screen.queryByTestId('board-close-sprint-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('board-settings-button')).toBeInTheDocument()
  })

  it('offers the GitHub issue picker only on a repo with a connected account', () => {
    useBoardData.mockReturnValue(
      makeBoardData({
        boards: [makeBoard()],
        activeBoard: makeBoard(),
        cards: [],
        canUseRemote: false,
      })
    )
    const { rerender } = render(<BoardToolbar repoPath="/repo" />)
    expect(screen.queryByTestId('board-add-issue-button')).not.toBeInTheDocument()

    useBoardData.mockReturnValue(
      makeBoardData({
        boards: [makeBoard()],
        activeBoard: makeBoard(),
        cards: [],
        canUseRemote: true,
      })
    )
    rerender(<BoardToolbar repoPath="/repo" />)
    expect(screen.getByTestId('board-add-issue-button')).toBeInTheDocument()
  })
})
