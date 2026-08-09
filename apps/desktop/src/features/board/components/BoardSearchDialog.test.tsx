import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard, makeCard } from '../test/boardFactories'

const { useAllBoardCards, useBoardCatalog, setActiveBoard } = vi.hoisted(() => ({
  useAllBoardCards: vi.fn(),
  useBoardCatalog: vi.fn(),
  setActiveBoard: vi.fn(),
}))
vi.mock('../hooks/useAllBoardCards', () => ({ useAllBoardCards }))
vi.mock('../hooks/useBoardCatalog', () => ({ useBoardCatalog }))
vi.mock('../hooks/useBoardBackends', () => ({
  useBoardBackends: () => ({
    ownerRepo: null,
    token: null,
    remoteBackend: null,
    backendFor: vi.fn(),
  }),
}))

import { BoardSearchDialog } from './BoardSearchDialog'
import { useBoardDialogsStore } from '../stores/boardDialogs.store'

const sprint = makeBoard({ id: 'b1', name: 'Sprint 12' })
const backlog = makeBoard({ id: 'b2', name: 'Backlog' })

function withCards(
  entries: { card: ReturnType<typeof makeCard>; board: ReturnType<typeof makeBoard> }[],
  overrides: { loading?: boolean; unreadable?: ReturnType<typeof makeBoard>[] } = {},
  boards = [sprint, backlog]
) {
  useAllBoardCards.mockReturnValue({
    cards: entries,
    loading: overrides.loading ?? false,
    unreadable: overrides.unreadable ?? [],
  })
  useBoardCatalog.mockReturnValue({ boards, setActiveBoard })
}

beforeEach(() => {
  vi.clearAllMocks()
  useBoardDialogsStore.getState().reset()
  useBoardDialogsStore.getState().open('globalSearch')
  withCards([])
})

describe('BoardSearchDialog', () => {
  it('says what to do before anything is typed, rather than claiming nothing was found', () => {
    render(<BoardSearchDialog repoPath="/repo" />)
    expect(
      screen.getByText('Type to search the tickets of every board in this repository.')
    ).toBeInTheDocument()
  })

  /** Three different empty states. "No ticket matches" while the boards are still being read would
   * be an answer to a question nobody has finished asking. */
  it('says it is still reading the boards rather than that nothing matched', () => {
    withCards([], { loading: true })
    render(<BoardSearchDialog repoPath="/repo" />)
    expect(screen.getByText('Reading every board…')).toBeInTheDocument()
  })

  it('finds a ticket on a board other than the one on screen', async () => {
    const user = userEvent.setup()
    withCards([
      { card: makeCard({ id: 'c1', title: 'Fix login' }), board: sprint },
      { card: makeCard({ id: 'c2', title: 'Rework the login page' }), board: backlog },
    ])
    render(<BoardSearchDialog repoPath="/repo" />)

    await user.type(screen.getByTestId('board-search-dialog-input'), 'login')

    expect(screen.getByTestId('board-search-result-c1')).toBeInTheDocument()
    expect(screen.getByTestId('board-search-result-c2')).toBeInTheDocument()
  })

  it('names the board each result is on, which is what tells two alike tickets apart', async () => {
    const user = userEvent.setup()
    withCards([{ card: makeCard({ id: 'c1', title: 'Fix login' }), board: backlog }])
    render(<BoardSearchDialog repoPath="/repo" />)

    await user.type(screen.getByTestId('board-search-dialog-input'), 'login')

    expect(screen.getByTestId('board-search-result-c1')).toHaveTextContent('Backlog')
  })

  /**
   * The card dialog resolves its id out of the *open* board's live card list, so opening it without
   * switching first would render a dialog over a board that has never heard of that id.
   */
  it('switches to the ticket’s board before opening it', async () => {
    const user = userEvent.setup()
    withCards([{ card: makeCard({ id: 'c9', title: 'Fix login' }), board: backlog }])
    render(<BoardSearchDialog repoPath="/repo" />)

    await user.type(screen.getByTestId('board-search-dialog-input'), 'login')
    await user.click(screen.getByTestId('board-search-result-c9'))

    expect(setActiveBoard).toHaveBeenCalledWith('b2')
    expect(useBoardDialogsStore.getState().cardDialog).toEqual({ mode: 'edit', cardId: 'c9' })
    expect(useBoardDialogsStore.getState().openDialog).toBeNull()
  })

  /**
   * `setActiveBoard` writes into the persisted selection, so pointing it at a board deleted between
   * the sweep and the click would leave the view with no board on screen and nothing to say why.
   */
  it('leaves the active board alone when the ticket’s board is gone', async () => {
    const user = userEvent.setup()
    withCards(
      [{ card: makeCard({ id: 'c9', title: 'Fix login' }), board: backlog }],
      {},
      [sprint] // the backlog has disappeared from the list since the sweep
    )
    render(<BoardSearchDialog repoPath="/repo" />)

    await user.type(screen.getByTestId('board-search-dialog-input'), 'login')
    await user.click(screen.getByTestId('board-search-result-c9'))

    expect(setActiveBoard).not.toHaveBeenCalled()
    expect(useBoardDialogsStore.getState().cardDialog).toEqual({ mode: 'edit', cardId: 'c9' })
  })

  /**
   * A sweep that could not read a board is answering a narrower question than the one asked, and
   * "no ticket matches" would be a lie about the boards it never opened.
   */
  it('says which boards it could not read, before the results', async () => {
    const user = userEvent.setup()
    withCards([{ card: makeCard({ id: 'c1', title: 'Fix login' }), board: sprint }], {
      unreadable: [backlog],
    })
    render(<BoardSearchDialog repoPath="/repo" />)

    await user.type(screen.getByTestId('board-search-dialog-input'), 'login')

    expect(screen.getByTestId('board-search-unreadable')).toHaveTextContent('Backlog')
  })

  it('closes and forgets the query', async () => {
    const user = userEvent.setup()
    withCards([{ card: makeCard({ id: 'c1', title: 'Fix login' }), board: sprint }])
    const { rerender } = render(<BoardSearchDialog repoPath="/repo" />)

    await user.type(screen.getByTestId('board-search-dialog-input'), 'login')
    await user.click(screen.getByTestId('board-search-result-c1'))

    useBoardDialogsStore.getState().open('globalSearch')
    rerender(<BoardSearchDialog repoPath="/repo" />)
    expect(screen.getByTestId('board-search-dialog-input')).toHaveValue('')
  })
})
