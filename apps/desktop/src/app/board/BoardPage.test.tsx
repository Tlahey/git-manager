import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard as board, makeCard as card } from '../../test/boardFactories'
import { useBoardStore } from '../../stores/board.store'
import { useBoardControlsStore } from '../../stores/boardControls.store'
import { BoardPage } from './BoardPage'

const { useBoardData, apiCreateAndCheckoutBranch, apiCheckoutBranch } = vi.hoisted(() => ({
  useBoardData: vi.fn(),
  apiCreateAndCheckoutBranch: vi.fn(),
  apiCheckoutBranch: vi.fn(),
}))
vi.mock('../../hooks/useBoardData', () => ({ useBoardData: useBoardData }))
vi.mock('../../api/git.api', () => ({ apiCreateAndCheckoutBranch, apiCheckoutBranch }))

function baseHookState(overrides: Partial<ReturnType<typeof useBoardData>> = {}) {
  return {
    boards: [],
    boardsLoading: false,
    activeBoard: null,
    setActiveBoard: vi.fn(),
    cards: [],
    cardsLoading: false,
    canUseRemote: false,
    remoteBoards: [],
    createBoard: vi.fn().mockResolvedValue(board()),
    updateBoardColumns: vi.fn().mockResolvedValue(undefined),
    deleteBoard: vi.fn().mockResolvedValue(undefined),
    createCard: vi.fn().mockResolvedValue(card()),
    updateCard: vi.fn().mockResolvedValue(card()),
    moveCard: vi.fn().mockResolvedValue(card()),
    deleteCard: vi.fn().mockResolvedValue(undefined),
    duplicateCard: vi.fn().mockResolvedValue(card()),
    createTagAndAssign: vi.fn().mockResolvedValue(null),
    addComment: vi.fn().mockResolvedValue(card()),
    loadComments: vi.fn().mockResolvedValue([]),
    updateBoardMeta: vi.fn().mockResolvedValue(undefined),
    closeSprint: vi.fn().mockResolvedValue(null),
    convertCardToIssue: vi.fn().mockResolvedValue(undefined),
    addIssueToBoard: vi.fn().mockResolvedValue(undefined),
    untrackCard: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useBoardControlsStore.setState({ search: '' })
  useBoardStore.setState({ activeBoardIdByRepo: {}, collapsedColumns: {} })
})

describe('BoardPage', () => {
  it('shows a loading spinner while the board list is loading', () => {
    useBoardData.mockReturnValue(baseHookState({ boardsLoading: true }))
    render(<BoardPage repoPath="/repo" />)
    expect(screen.queryByText('No boards yet')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no boards, and opens the create dialog', async () => {
    useBoardData.mockReturnValue(baseHookState())
    render(<BoardPage repoPath="/repo" />)

    expect(
      screen.getByText('Create a board to start tracking cards for this repository.')
    ).toBeInTheDocument()

    await userEvent.click(screen.getAllByText('New board')[0])
    expect(screen.getByTestId('create-board-dialog')).toBeInTheDocument()
  })

  it('renders the active board’s columns and cards', () => {
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card(), card({ id: 'c2', title: 'Second task', columnId: 'done' })],
      })
    )
    render(<BoardPage repoPath="/repo" />)

    expect(screen.getByTestId('board-column-todo')).toBeInTheDocument()
    expect(screen.getByTestId('board-column-done')).toBeInTheDocument()
    expect(screen.getByText('Fix the header')).toBeInTheDocument()
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('filters cards by the search box', async () => {
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card(), card({ id: 'c2', title: 'Second task' })],
      })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.type(screen.getByTestId('board-search-input'), 'Second')

    expect(screen.getByText('Second task')).toBeInTheDocument()
    expect(screen.queryByText('Fix the header')).not.toBeInTheDocument()
  })

  it('creates a card in the column whose add button was clicked', async () => {
    const createCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [], createCard })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('board-column-done-add-card'))
    await userEvent.type(screen.getByTestId('board-card-title-input'), 'New task')
    await userEvent.click(screen.getByTestId('board-card-save'))

    expect(createCard).toHaveBeenCalledWith('done', 'New task', '')
  })

  it('opens the edit dialog with the clicked card’s content and saves changes', async () => {
    const updateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card({ description: 'Original description' })],
        updateCard,
      })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('board-card-c1'))
    // The card opens as a record, not a form: the title reads back before it can be edited.
    expect(screen.getByTestId('card-title-display')).toHaveTextContent('Fix the header')

    await userEvent.click(screen.getByTestId('card-title-display'))
    const titleInput = screen.getByTestId('card-title-input')
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Fix the footer')
    await userEvent.click(screen.getByTestId('card-title-save'))

    // Each field saves on its own, so the patch carries the title alone.
    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), {
      title: 'Fix the footer',
    })
  })

  it('deletes the active board after confirming', async () => {
    const deleteBoard = vi.fn().mockResolvedValue(undefined)
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [], deleteBoard })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('board-delete-button'))
    await userEvent.click(screen.getByTestId('delete-board-confirm'))

    expect(deleteBoard).toHaveBeenCalledWith(board())
  })

  it('creates and checks out a branch for a card, then links it', async () => {
    apiCreateAndCheckoutBranch.mockResolvedValue(undefined)
    const updateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()], updateCard })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.click(screen.getByTestId('board-card-create-branch'))

    expect(apiCreateAndCheckoutBranch).toHaveBeenCalledWith('/repo', 'card/fix-the-header', 'HEAD')
    expect(updateCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      { linkedBranch: 'card/fix-the-header' }
    )
  })

  it('checks out an already-linked branch without recreating it', async () => {
    apiCheckoutBranch.mockResolvedValue(undefined)
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card({ linkedBranch: 'feature/header' })],
      })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.click(screen.getByTestId('board-card-checkout-branch'))

    expect(apiCheckoutBranch).toHaveBeenCalledWith('/repo', 'feature/header')
    expect(apiCreateAndCheckoutBranch).not.toHaveBeenCalled()
  })

  it('unlinks a branch by clearing linkedBranch on the card', async () => {
    const updateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card({ linkedBranch: 'feature/header' })],
        updateCard,
      })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.click(screen.getByTestId('board-card-unlink-branch'))

    expect(updateCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      { linkedBranch: null }
    )
  })
})

/**
 * A closed sprint is an archive: readable, with its frozen report, and inert. The numbers come from
 * the stored summary rather than from the cards still on the board, because closing normally moves
 * the unfinished ones to the successor sprint.
 */
describe('BoardPage — a closed sprint is read-only', () => {
  const closedBoard = () =>
    board({
      closedAt: '2026-08-04T10:00:00.000Z',
      summary: {
        closedAt: '2026-08-04T10:00:00.000Z',
        totalCards: 8,
        doneCards: 6,
        unfinishedCards: 2,
        completionRate: 75,
        blockedCards: 1,
        overdueCards: 0,
        byColumn: [{ columnId: 'todo', columnName: 'To do', count: 2 }],
        byPriority: [{ priority: 'high', count: 3 }],
        byAssignee: [{ assignee: 'ada', total: 4, done: 3 }],
      },
    })

  function renderClosed() {
    useBoardData.mockReturnValue(
      baseHookState({ boards: [closedBoard()], activeBoard: closedBoard(), cards: [card()] })
    )
    render(<BoardPage repoPath="/repo" />)
  }

  it('says the sprint is closed', () => {
    renderClosed()
    expect(screen.getByTestId('board-closed-banner')).toHaveTextContent(
      'This sprint is closed. Its cards are read-only.'
    )
  })

  it('shows the frozen report, not a recount of the cards still on the board', () => {
    renderClosed()
    // One card is left on the board, but the sprint ran eight.
    expect(screen.getByTestId('sprint-completion')).toHaveTextContent('75%')
    expect(screen.getByTestId('sprint-by-assignee')).toHaveTextContent('ada')
  })

  it('offers no way to add a card or edit the board', () => {
    renderClosed()
    expect(screen.queryByTestId('board-column-todo-add-card')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-edit-columns-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-settings-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-close-sprint-button')).not.toBeInTheDocument()
  })

  it('still lets the sprint be deleted, and a new one started', () => {
    renderClosed()
    expect(screen.getByTestId('board-delete-button')).toBeInTheDocument()
    expect(screen.getByTestId('create-board-button')).toBeInTheDocument()
  })

  it('opens its cards read-only', async () => {
    renderClosed()
    await userEvent.click(screen.getByTestId('board-card-c1'))
    expect(screen.getByTestId('card-title-display')).toBeDisabled()
    expect(screen.queryByTestId('card-description-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-actions-menu')).not.toBeInTheDocument()
  })
})

describe('BoardPage — closed sprints are hidden from the picker', () => {
  it('keeps a closed sprint out of the list unless asked for', async () => {
    const open = board({ id: 'b1', name: 'Sprint 13' })
    const closed = board({ id: 'b0', name: 'Sprint 12', closedAt: '2026-08-04T10:00:00.000Z' })
    useBoardData.mockReturnValue(
      baseHookState({ boards: [open, closed], activeBoard: open, cards: [] })
    )
    render(<BoardPage repoPath="/repo" />)

    // The list lives inside the picker's popover, so it has to be opened to be inspected.
    await userEvent.click(screen.getByTestId('board-switcher'))
    expect(screen.queryByTestId('board-switcher-option-b0')).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByTestId('board-show-closed'))
    await userEvent.click(screen.getByTestId('board-switcher'))
    expect(screen.getByTestId('board-switcher-option-b0')).toHaveTextContent('Sprint 12')
  })

  it('keeps the sprint that is open on screen even while it is closed', () => {
    const closed = board({ closedAt: '2026-08-04T10:00:00.000Z' })
    useBoardData.mockReturnValue(
      baseHookState({ boards: [closed], activeBoard: closed, cards: [] })
    )
    render(<BoardPage repoPath="/repo" />)
    expect(screen.getByTestId('board-switcher')).toHaveTextContent('Sprint 12')
  })
})

describe('BoardPage — a card tracking a GitHub issue', () => {
  const tracked = () =>
    card({ prefix: 'GM', sourceIssue: { owner: 'acme', repo: 'widgets', number: 42 }, issueState: 'open' })

  function renderWith(cards: ReturnType<typeof card>[], boardOverrides = {}) {
    const b = board(boardOverrides)
    useBoardData.mockReturnValue(baseHookState({ boards: [b], activeBoard: b, cards }))
    render(<BoardPage repoPath="/repo" />)
  }

  /** Both numbers are shown: the board's own identifier (`GM-1`) and the issue's (`#42`) are
   * different things, and neither stands in for the other. */
  it('shows the issue number beside the card identifier, not instead of it', () => {
    renderWith([tracked()], { cardPrefixes: ['GM'] })
    expect(screen.getByTestId('board-card-tracked')).toHaveTextContent('#42')
    expect(screen.getByTestId('board-card-identifier')).toHaveTextContent('GM-1')
  })

  it('shows no tracking marker on an ordinary card', () => {
    renderWith([card()])
    expect(screen.queryByTestId('board-card-tracked')).not.toBeInTheDocument()
  })

  it('offers the tracking section — and untracking — once the card is open', async () => {
    const untrackCard = vi.fn().mockResolvedValue(undefined)
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [tracked()],
        untrackCard,
      })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('board-card-c1'))
    expect(screen.getByTestId('card-meta-tracking')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('card-tracking-untrack'))
    expect(untrackCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
  })

  it('shows no tracking section for an untracked card', async () => {
    renderWith([card()])
    await userEvent.click(screen.getByTestId('board-card-c1'))
    expect(screen.queryByTestId('card-meta-tracking')).not.toBeInTheDocument()
  })
})

/**
 * A dialog opened from another one replaces it rather than stacking, so closing it has to put back
 * what it replaced — otherwise following a card out of the archive list quietly loses your place.
 */
describe('BoardPage — returning to the dialog you came from', () => {
  const archivedCard = () => card({ id: 'c2', title: 'Buried', archivedAt: '2026-08-04T00:00:00.000Z' })

  function renderWith(overrides = {}) {
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card(), archivedCard()],
        ...overrides,
      })
    )
    render(<BoardPage repoPath="/repo" />)
  }

  async function openArchivedCard() {
    await userEvent.click(screen.getByTestId('board-archived-button'))
    await userEvent.click(screen.getByTestId('archived-card-open-c2'))
  }

  it('reopens the archive list when the card opened from it is closed', async () => {
    renderWith()
    await openArchivedCard()

    // The card replaced the list rather than stacking on it.
    expect(screen.getByTestId('board-card-dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('archived-cards-dialog')).not.toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByTestId('archived-cards-dialog')).toBeInTheDocument())
  })

  it('does not reopen it for a card opened from the board itself', async () => {
    renderWith()
    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByTestId('board-card-dialog')).not.toBeInTheDocument())
    expect(screen.queryByTestId('archived-cards-dialog')).not.toBeInTheDocument()
  })

  it('reopens the archive list after cancelling a delete started from it', async () => {
    renderWith()
    await userEvent.click(screen.getByTestId('board-archived-button'))
    await userEvent.click(screen.getByTestId('archived-card-delete-c2'))
    expect(screen.getByTestId('delete-card-dialog')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByTestId('archived-cards-dialog')).toBeInTheDocument())
  })

  /** Cancelling a delete started from a card puts that card back, not the board. */
  it('reopens the card after cancelling a delete started from it', async () => {
    renderWith()
    await userEvent.click(screen.getByTestId('board-card-c1'))
    // The card face carries a `⋯` too, so the one inside the open dialog has to be named.
    const dialog = screen.getByTestId('board-card-dialog')
    await userEvent.click(within(dialog).getByTestId('card-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-delete'))
    await waitFor(() => expect(screen.getByTestId('delete-card-dialog')).toBeInTheDocument())

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('board-card-dialog')).toBeInTheDocument())
  })

  /** A card deleted while its dialog was the origin resolves to nothing, so restoring the id is a
   * no-op rather than an empty dialog. */
  it('reopens nothing when the card it would return to is gone', async () => {
    const deleteCard = vi.fn().mockResolvedValue(undefined)
    renderWith({ deleteCard, cards: [card()] })

    await userEvent.click(screen.getByTestId('board-card-c1'))
    // The card face carries a `⋯` too, so the one inside the open dialog has to be named.
    const dialog = screen.getByTestId('board-card-dialog')
    await userEvent.click(within(dialog).getByTestId('card-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-delete'))
    await waitFor(() => expect(screen.getByTestId('delete-card-dialog')).toBeInTheDocument())

    // The card list the page renders from no longer holds it, as after a real delete.
    useBoardData.mockReturnValue(baseHookState({ boards: [board()], activeBoard: board(), cards: [] }))
    fireEvent.click(screen.getByTestId('delete-card-confirm'))

    await waitFor(() => expect(deleteCard).toHaveBeenCalled())
    expect(screen.queryByTestId('board-card-dialog')).not.toBeInTheDocument()
  })
})

/**
 * Archiving is the reversible neighbour of deleting: the card leaves the columns but is kept, and a
 * search is what brings it back into view.
 */
describe('BoardPage — archived cards', () => {
  it('hides an archived card while browsing', () => {
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card({ id: 'c1' }), card({ id: 'c2', archivedAt: '2026-08-04T00:00:00.000Z' })],
      })
    )
    render(<BoardPage repoPath="/repo" />)

    expect(screen.getByTestId('board-card-c1')).toBeInTheDocument()
    expect(screen.queryByTestId('board-card-c2')).not.toBeInTheDocument()
  })

  it('offers the archive list only once something is in it', async () => {
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()] })
    )
    const { rerender } = render(<BoardPage repoPath="/repo" />)
    expect(screen.queryByTestId('board-archived-button')).not.toBeInTheDocument()

    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card({ id: 'c2', archivedAt: '2026-08-04T00:00:00.000Z' })],
      })
    )
    rerender(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('board-archived-button'))
    expect(screen.getByTestId('archived-cards-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('archived-card-c2')).toBeInTheDocument()
  })

  it('restores a card from the archive list', async () => {
    const updateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card({ id: 'c2', archivedAt: '2026-08-04T00:00:00.000Z' })],
        updateCard,
      })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('board-archived-button'))
    await userEvent.click(screen.getByTestId('archived-card-unarchive-c2'))

    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }), {
      archivedAt: null,
    })
  })

  it('brings it back as soon as the search matches it', async () => {
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card({ id: 'c2', title: 'Buried task', archivedAt: '2026-08-04T00:00:00.000Z' })],
      })
    )
    render(<BoardPage repoPath="/repo" />)
    expect(screen.queryByTestId('board-card-c2')).not.toBeInTheDocument()

    await userEvent.type(screen.getByTestId('board-search-input'), 'Buried')
    expect(screen.getByTestId('board-card-c2')).toBeInTheDocument()
    expect(screen.getByTestId('board-card-archived')).toBeInTheDocument()
  })

  /**
   * "Without opening it" is the assertion that matters. The menu renders in a portal, but React
   * events bubble through the React tree, so a click on an item used to reach the card's own
   * `onClick` too — running the action *and* opening the dialog on top of it.
   */
  it('archives from the card’s own menu, without opening it', async () => {
    const updateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()], updateCard })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('card-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-archive'))

    expect(updateCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      { archivedAt: expect.any(String) }
    )
    expect(screen.queryByTestId('board-card-dialog')).not.toBeInTheDocument()
  })

  it('duplicates from the menu without opening the card either', async () => {
    const duplicateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()], duplicateCard })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('card-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-duplicate'))

    expect(duplicateCard).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('board-card-dialog')).not.toBeInTheDocument()
  })

  it('confirms before deleting, rather than deleting on the spot', async () => {
    const deleteCard = vi.fn().mockResolvedValue(undefined)
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()], deleteCard })
    )
    render(<BoardPage repoPath="/repo" />)

    await userEvent.click(screen.getByTestId('card-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-delete'))
    expect(deleteCard).not.toHaveBeenCalled()

    expect(screen.getByTestId('delete-card-dialog')).toBeInTheDocument()
    // `fireEvent`: Radix keeps `pointer-events: none` on the body while the dropdown that opened
    // this dialog finishes unmounting, and userEvent refuses to click through that.
    fireEvent.click(screen.getByTestId('delete-card-confirm'))
    await waitFor(() =>
      expect(deleteCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
    )
  })
})
