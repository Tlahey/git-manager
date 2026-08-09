import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeBoard as board, makeCard as card, makeBoardData } from './test/boardFactories'
import { useBoardStore } from './stores/board.store'
import { useBoardControlsStore } from './stores/boardControls.store'
import { useBoardDialogsStore } from './stores/boardDialogs.store'
import { BoardPage } from './BoardPage'
import { BoardToolbar } from './components/BoardToolbar'
import { BoardSidebar } from './components/BoardSidebar'

const { useBoardData, apiCreateAndCheckoutBranch, apiCheckoutBranch } = vi.hoisted(() => ({
  useBoardData: vi.fn(),
  apiCreateAndCheckoutBranch: vi.fn(),
  apiCheckoutBranch: vi.fn(),
}))
vi.mock('./hooks/useBoardData', () => ({ useBoardData: useBoardData }))
vi.mock('../../api/git.api', () => ({ apiCreateAndCheckoutBranch, apiCheckoutBranch }))

function baseHookState(overrides: Partial<ReturnType<typeof useBoardData>> = {}) {
  return makeBoardData(overrides)
}

/**
 * The board **view**, not just the page: its toolbar and its board list moved into the repo tab's
 * own chrome when that chrome became view-scoped, so the search box, the archive, the sprint actions
 * and the board picker are drawn beside the page rather than inside it. All three read the same
 * mocked `useBoardData` and write the same dialog store, which is what still makes this one test.
 */
const boardView = (repoPath = '/repo') => (
  <>
    <BoardToolbar repoPath={repoPath} />
    <BoardSidebar repoPath={repoPath} />
    <BoardPage repoPath={repoPath} />
  </>
)

function renderBoardView(repoPath = '/repo') {
  return render(boardView(repoPath))
}

beforeEach(() => {
  vi.clearAllMocks()
  useBoardControlsStore.getState().reset()
  useBoardDialogsStore.getState().reset()
  useBoardStore.setState({ activeBoardIdByRepo: {}, collapsedColumns: {} })
})

describe('BoardPage', () => {
  it('shows a loading spinner while the board list is loading', () => {
    useBoardData.mockReturnValue(baseHookState({ boardsLoading: true }))
    renderBoardView()
    expect(screen.queryByText('No boards yet')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no boards, and opens the create dialog', async () => {
    useBoardData.mockReturnValue(baseHookState())
    renderBoardView()

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
    renderBoardView()

    expect(screen.getByTestId('board-column-todo')).toBeInTheDocument()
    expect(screen.getByTestId('board-column-done')).toBeInTheDocument()
    expect(screen.getByText('Fix the header')).toBeInTheDocument()
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('filters cards by the search the toolbar opens', async () => {
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card(), card({ id: 'c2', title: 'Second task' })],
      })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-search-button'))
    await userEvent.type(screen.getByTestId('board-search-panel-input'), 'Second')

    expect(screen.getByText('Second task')).toBeInTheDocument()
    expect(screen.queryByText('Fix the header')).not.toBeInTheDocument()
  })

  it('creates a card in the column whose add button was clicked', async () => {
    const createCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [], createCard })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-column-done-add-card'))
    await userEvent.type(screen.getByTestId('board-card-title-input'), 'New task')
    await userEvent.click(screen.getByTestId('board-card-save'))

    // 'SPR' — the fallback derived from the board's name, since this board offers no prefix of its
    // own. A card created with an empty prefix would have no identifier at all (`offeredCardPrefixes`).
    expect(createCard).toHaveBeenCalledWith('done', 'New task', '', 'SPR', 'task')
  })

  /** The prefix and the kind are picked in the dialog and travel to the backend with the card — the
   * board's own list picks a new prefix up from that same write, so nothing else is saved here. */
  it('creates the card with the prefix and kind chosen in the dialog', async () => {
    const createCard = vi.fn().mockResolvedValue(card())
    const withPrefix = board({ cardPrefixes: ['GM'] })
    useBoardData.mockReturnValue(
      baseHookState({ boards: [withPrefix], activeBoard: withPrefix, cards: [], createCard })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-column-done-add-card'))
    await userEvent.click(screen.getByTestId('card-kind-option-bug'))
    await userEvent.type(screen.getByTestId('board-card-title-input'), 'Crash on open')
    await userEvent.click(screen.getByTestId('board-card-save'))

    expect(createCard).toHaveBeenCalledWith('done', 'Crash on open', '', 'GM', 'bug')
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
    renderBoardView()

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
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-delete-button'))
    await userEvent.click(screen.getByTestId('delete-board-confirm'))

    expect(deleteBoard).toHaveBeenCalledWith(board(), true)
  })

  it('creates and checks out a branch for a card, then links it', async () => {
    apiCreateAndCheckoutBranch.mockResolvedValue(undefined)
    const updateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()], updateCard })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.click(screen.getByTestId('board-card-create-branch'))

    expect(apiCreateAndCheckoutBranch).toHaveBeenCalledWith('/repo', 'card/fix-the-header', 'HEAD')
    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), {
      linkedBranch: 'card/fix-the-header',
    })
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
    renderBoardView()

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
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.click(screen.getByTestId('board-card-unlink-branch'))

    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), {
      linkedBranch: null,
    })
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
    renderBoardView()
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
    expect(screen.queryByTestId('card-dialog-actions-menu')).not.toBeInTheDocument()
  })
})

describe('BoardPage — closed sprints are hidden from the board list', () => {
  it('keeps a closed sprint out of the list unless asked for', async () => {
    const open = board({ id: 'b1', name: 'Sprint 13' })
    const closed = board({ id: 'b0', name: 'Sprint 12', closedAt: '2026-08-04T10:00:00.000Z' })
    useBoardData.mockReturnValue(
      baseHookState({ boards: [open, closed], activeBoard: open, cards: [] })
    )
    renderBoardView()

    expect(screen.queryByTestId('board-sidebar-item-b0')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('board-show-closed'))
    expect(screen.getByTestId('board-sidebar-item-b0')).toHaveTextContent('Sprint 12')
  })

  it('keeps the sprint that is open on screen even while it is closed', () => {
    const closed = board({ closedAt: '2026-08-04T10:00:00.000Z' })
    useBoardData.mockReturnValue(
      baseHookState({ boards: [closed], activeBoard: closed, cards: [] })
    )
    renderBoardView()
    expect(screen.getByTestId('board-sidebar-item-b1')).toHaveTextContent('Sprint 12')
  })
})

describe('BoardPage — a card tracking a GitHub issue', () => {
  const tracked = () =>
    card({
      prefix: 'GM',
      sourceIssue: { owner: 'acme', repo: 'widgets', number: 42 },
      issueState: 'open',
    })

  function renderWith(cards: ReturnType<typeof card>[], boardOverrides = {}) {
    const b = board(boardOverrides)
    useBoardData.mockReturnValue(baseHookState({ boards: [b], activeBoard: b, cards }))
    renderBoardView()
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
    renderBoardView()

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
  const archivedCard = () =>
    card({ id: 'c2', title: 'Buried', archivedAt: '2026-08-04T00:00:00.000Z' })

  function renderWith(overrides = {}) {
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card(), archivedCard()],
        ...overrides,
      })
    )
    renderBoardView()
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
    await userEvent.click(screen.getByTestId('card-dialog-actions-menu'))
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
    await userEvent.click(screen.getByTestId('card-dialog-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-delete'))
    await waitFor(() => expect(screen.getByTestId('delete-card-dialog')).toBeInTheDocument())

    // The card list the page renders from no longer holds it, as after a real delete.
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [] })
    )
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
    renderBoardView()

    expect(screen.getByTestId('board-card-c1')).toBeInTheDocument()
    expect(screen.queryByTestId('board-card-c2')).not.toBeInTheDocument()
  })

  it('offers the archive list only once something is in it', async () => {
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()] })
    )
    const { rerender } = renderBoardView()
    expect(screen.queryByTestId('board-archived-button')).not.toBeInTheDocument()

    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card({ id: 'c2', archivedAt: '2026-08-04T00:00:00.000Z' })],
      })
    )
    rerender(boardView())

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
    renderBoardView()

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
    renderBoardView()
    expect(screen.queryByTestId('board-card-c2')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('board-search-button'))
    await userEvent.type(screen.getByTestId('board-search-panel-input'), 'Buried')
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
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-archive'))

    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), {
      archivedAt: expect.any(String),
    })
    expect(screen.queryByTestId('board-card-dialog')).not.toBeInTheDocument()
  })

  it('duplicates from the menu without opening the card either', async () => {
    const duplicateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()], duplicateCard })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-duplicate'))

    expect(duplicateCard).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('board-card-dialog')).not.toBeInTheDocument()
  })

  it('confirms before deleting, rather than deleting on the spot', async () => {
    const deleteCard = vi.fn().mockResolvedValue(undefined)
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()], deleteCard })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-actions-menu'))
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

describe('BoardPage — the way back out of a chain of dialogs', () => {
  /** Archive list → card → delete confirmation, unwound in order. The single-origin design lost the
   * archive list at the third hop. */
  it('returns through the card to the archive list it started from', async () => {
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card({ archivedAt: '2026-08-01T00:00:00.000Z' })],
      })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-archived-button'))
    await userEvent.click(screen.getByTestId('archived-card-open-c1'))
    await waitFor(() => expect(screen.getByTestId('board-card-dialog')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('card-dialog-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-delete'))
    await waitFor(() => expect(screen.getByTestId('delete-card-dialog')).toBeInTheDocument())

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('board-card-dialog')).toBeInTheDocument())

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('archived-cards-dialog')).toBeInTheDocument())
  })
})

describe('BoardPage — relating two cards', () => {
  const other = card({ id: 'c2', title: 'Ship the release' })

  it('stores a forward relation on the card that is open', async () => {
    const updateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card(), other],
        updateCard,
      })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.click(screen.getByTestId('card-links-add'))
    await userEvent.selectOptions(screen.getByTestId('card-link-kind'), 'blocks')
    await userEvent.click(screen.getByTestId('card-link-option-c2'))

    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), {
      links: [{ targetBoardId: 'b1', targetCardId: 'c2', kind: 'blocks' }],
    })
  })

  /** "This card is blocked by X" is `blocks` written on **X** — there is no stored inverse half, so
   * the write has to land on the other card. */
  it('stores an inverse relation on the other card', async () => {
    const updateCard = vi.fn().mockResolvedValue(card())
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board()],
        activeBoard: board(),
        cards: [card(), other],
        updateCard,
      })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.click(screen.getByTestId('card-links-add'))
    await userEvent.selectOptions(screen.getByTestId('card-link-kind'), 'blockedBy')
    await userEvent.click(screen.getByTestId('card-link-option-c2'))

    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }), {
      links: [{ targetBoardId: 'b1', targetCardId: 'c1', kind: 'blocks' }],
    })
  })
})

describe('BoardPage — the card’s parent', () => {
  const epic = card({ id: 'epic', title: 'Redesign', kind: 'epic', prefix: 'GM', number: 3 })
  const child = card({ id: 'c1', title: 'Fix the header', prefix: 'GM', number: 7 })

  /** Setting a parent writes `contains` on the **parent** — only forward halves are stored. */
  it('links a parent from the breadcrumb, writing on the parent card', async () => {
    const updateCard = vi.fn().mockResolvedValue(child)
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [child, epic], updateCard })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.click(screen.getByTestId('card-breadcrumb-add-parent'))
    await userEvent.click(screen.getByTestId('card-link-option-epic'))

    expect(updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'epic' }), {
      links: [{ targetBoardId: 'b1', targetCardId: 'c1', kind: 'contains' }],
    })
  })

  it('walks up to the parent, replacing the card on screen', async () => {
    const parented = card({
      id: 'epic',
      title: 'Redesign',
      kind: 'epic',
      prefix: 'GM',
      number: 3,
      links: [{ targetBoardId: 'b1', targetCardId: 'c1', kind: 'contains' }],
    })
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [child, parented] })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-c1'))
    expect(screen.getByTestId('card-title-display')).toHaveTextContent('Fix the header')

    await userEvent.click(screen.getByTestId('card-breadcrumb-parent'))
    await waitFor(() =>
      expect(screen.getByTestId('card-title-display')).toHaveTextContent('Redesign')
    )
  })
})

describe('BoardPage — moving a card to another board', () => {
  const other = board({ id: 'b2', name: 'Sprint 13' })

  it('offers no move when this repo has a single board', async () => {
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board()], activeBoard: board(), cards: [card()] })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-actions-menu'))
    expect(screen.queryByTestId('card-action-move')).not.toBeInTheDocument()
  })

  it('moves the card to the picked board and column', async () => {
    const moveCardToBoard = vi.fn().mockResolvedValue(undefined)
    useBoardData.mockReturnValue(
      baseHookState({
        boards: [board(), other],
        activeBoard: board(),
        cards: [card()],
        moveCardToBoard,
      })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-move'))

    expect(screen.getByTestId('move-card-dialog')).toBeInTheDocument()
    // `fireEvent`: Radix keeps `pointer-events: none` on the body while the dropdown that opened
    // this dialog finishes unmounting, and userEvent refuses to click through that.
    fireEvent.click(screen.getByTestId('move-card-submit'))

    await waitFor(() =>
      expect(moveCardToBoard).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1' }),
        'b2',
        'todo'
      )
    )
  })

  /** Cancelling a move started from an open card puts that card back, not the board. */
  it('reopens the card after cancelling a move started from it', async () => {
    useBoardData.mockReturnValue(
      baseHookState({ boards: [board(), other], activeBoard: board(), cards: [card()] })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-card-c1'))
    await userEvent.click(screen.getByTestId('card-dialog-actions-menu'))
    await userEvent.click(screen.getByTestId('card-action-move'))
    await waitFor(() => expect(screen.getByTestId('move-card-dialog')).toBeInTheDocument())

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByTestId('board-card-dialog')).toBeInTheDocument())
  })
})

/**
 * Only an iteration ends. A standing board — a backlog a ticket passes through on its way to a
 * sprint — has no period to close, so it is offered no way to.
 */
describe('BoardPage — iteration vs standing board', () => {
  function renderWith(iteration: boolean | undefined) {
    const b = board({ iteration })
    useBoardData.mockReturnValue(baseHookState({ boards: [b], activeBoard: b, cards: [] }))
    renderBoardView()
  }

  it('offers to close an iteration', () => {
    renderWith(true)
    expect(screen.getByTestId('board-close-sprint-button')).toBeInTheDocument()
  })

  it('offers no closing on a standing board, keeping its other actions', () => {
    renderWith(false)
    expect(screen.queryByTestId('board-close-sprint-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('board-edit-columns-button')).toBeInTheDocument()
    expect(screen.getByTestId('board-settings-button')).toBeInTheDocument()
  })

  /** Boards written before the flag existed were created when closing was the only behaviour. */
  it('treats a board with no flag as an iteration', () => {
    renderWith(undefined)
    expect(screen.getByTestId('board-close-sprint-button')).toBeInTheDocument()
  })
})

/** The column header carries the actions that act on its cards as a set. */
describe('BoardPage — column actions', () => {
  const withColumns = (extra = {}) =>
    board({
      columns: [
        { id: 'todo', name: 'To do', order: 0 },
        { id: 'done', name: 'Done', order: 1, isDone: true },
      ],
      ...extra,
    })

  it('opens the archive confirmation from the column menu', async () => {
    const b = withColumns()
    useBoardData.mockReturnValue(
      baseHookState({ boards: [b], activeBoard: b, cards: [card({ id: 'c1', columnId: 'todo' })] })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-column-todo-menu'))
    await userEvent.click(screen.getByTestId('column-action-archive-all'))

    expect(screen.getByTestId('archive-column-dialog')).toBeInTheDocument()
  })

  /** No other board to empty into: the entry would open a picker with nothing in it. */
  it('offers no move when this is the only board', async () => {
    const b = withColumns()
    useBoardData.mockReturnValue(
      baseHookState({ boards: [b], activeBoard: b, cards: [card({ id: 'c1', columnId: 'todo' })] })
    )
    renderBoardView()

    await userEvent.click(screen.getByTestId('board-column-todo-menu'))

    expect(screen.getByTestId('column-action-archive-all')).toBeInTheDocument()
    expect(screen.queryByTestId('column-action-move-all')).not.toBeInTheDocument()
  })

  it('has no menu on an empty column', () => {
    const b = withColumns()
    useBoardData.mockReturnValue(baseHookState({ boards: [b], activeBoard: b, cards: [] }))
    renderBoardView()

    expect(screen.queryByTestId('board-column-todo-menu')).not.toBeInTheDocument()
  })

  /** A closed sprint is a record: nothing on it moves, including a whole column of it. */
  it('has no menu on a closed sprint', () => {
    const b = withColumns({ closedAt: '2026-08-05T00:00:00.000Z' })
    useBoardData.mockReturnValue(
      baseHookState({ boards: [b], activeBoard: b, cards: [card({ id: 'c1', columnId: 'todo' })] })
    )
    renderBoardView()

    expect(screen.queryByTestId('board-column-todo-menu')).not.toBeInTheDocument()
  })
})

/**
 * A board deleted with its tickets archived is not gone — it cannot be, since a card belongs to a
 * board and the archived ones still name this one. It is hidden, read-only, and reachable again
 * through its own toggle, which is what stops the kept tickets from being kept somewhere unreadable.
 */
describe('BoardPage — a deleted board is tombstoned, not gone', () => {
  const deleted = () =>
    board({ id: 'gone', name: 'Old sprint', deletedAt: '2026-08-06T00:00:00.000Z' })
  const live = () => board({ id: 'live', name: 'Sprint 13' })

  function renderWith(activeBoard = deleted()) {
    useBoardData.mockReturnValue(
      baseHookState({ boards: [live(), deleted()], activeBoard, cards: [] })
    )
    renderBoardView()
  }

  it('says why it is still here, rather than calling itself read-only', () => {
    renderWith()
    const banner = screen.getByTestId('board-deleted-banner')
    expect(banner).toHaveTextContent('This board was deleted')
    expect(banner).toHaveTextContent(/archived rather than destroyed/)
    // The closed-sprint banner is a different statement and must not double up.
    expect(screen.queryByTestId('board-closed-banner')).not.toBeInTheDocument()
  })

  it('is read-only, like a closed sprint', () => {
    renderWith()
    expect(screen.queryByTestId('board-edit-columns-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-settings-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-close-sprint-button')).not.toBeInTheDocument()
  })

  /** Deleting it again would destroy exactly what the first deletion chose to keep. */
  it('cannot be deleted a second time', () => {
    renderWith()
    expect(screen.queryByTestId('board-delete-button')).not.toBeInTheDocument()
  })

  it('still offers deletion on a board that is merely live', () => {
    renderWith(live())
    expect(screen.getByTestId('board-delete-button')).toBeInTheDocument()
  })

  it('is hidden from the board list until asked for, and the toggle brings it back', async () => {
    renderWith(live())

    expect(screen.queryByTestId('board-sidebar-item-gone')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('board-show-deleted'))
    expect(screen.getByTestId('board-sidebar-item-gone')).toBeInTheDocument()
  })
})
