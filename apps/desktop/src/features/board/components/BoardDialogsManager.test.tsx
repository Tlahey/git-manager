import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect, useRef } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardData } from '../hooks/useBoardData'
import { makeBoard, makeCard, makeBoardData } from '../test/boardFactories'
import { useBoardDialogs, type BoardDialogs } from '../hooks/useBoardDialogs'
import { BoardDialogsManager } from './BoardDialogsManager'

vi.mock('../../../api/git.api', () => ({
  apiCreateAndCheckoutBranch: vi.fn().mockResolvedValue(undefined),
  apiCheckoutBranch: vi.fn().mockResolvedValue(undefined),
}))

/**
 * Mounts the manager with a real `useBoardDialogs`, opening one dialog on mount — the manager reads
 * that state and never sets it from nothing, so a test has to start it the way the page's header
 * would.
 */
function Harness({ data, open }: { data: BoardData; open?: (dialogs: BoardDialogs) => void }) {
  const dialogs = useBoardDialogs()
  // Through refs so the effect genuinely has no dependencies: it stands in for the header click that
  // would have opened the dialog, and re-running it would fight whatever the test does next.
  const latest = useRef({ open, dialogs })
  latest.current = { open, dialogs }
  useEffect(() => {
    latest.current.open?.(latest.current.dialogs)
  }, [])
  return <BoardDialogsManager repoPath="/repo" data={data} dialogs={dialogs} />
}

function renderManager(data: Partial<BoardData> = {}, open?: (dialogs: BoardDialogs) => void) {
  const full = makeBoardData(data)
  render(<Harness data={full} open={open} />)
  return full
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BoardDialogsManager', () => {
  it('renders no dialog until one is opened', () => {
    renderManager({ boards: [makeBoard()], activeBoard: makeBoard() })
    expect(screen.queryByTestId('board-card-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('board-settings-dialog')).not.toBeInTheDocument()
  })

  it('renders the board-level dialog named by the open slot', () => {
    renderManager({ boards: [makeBoard()], activeBoard: makeBoard() }, (d) =>
      d.open('boardSettings')
    )
    expect(screen.getByTestId('board-settings-dialog')).toBeInTheDocument()
  })

  /**
   * Creating a board is the one dialog reachable with none open — every other board-scoped dialog
   * would have to read fields off a board that isn't there.
   */
  it('offers board creation with no active board, and nothing else', () => {
    renderManager({}, (d) => d.open('createBoard'))
    expect(screen.getByTestId('create-board-dialog')).toBeInTheDocument()
  })

  it('renders nothing for a board-scoped dialog when no board is active', () => {
    renderManager({}, (d) => d.open('boardSettings'))
    expect(screen.queryByTestId('board-settings-dialog')).not.toBeInTheDocument()
  })
})

describe('BoardDialogsManager — the edit dialog resolves its card', () => {
  /** The dialog state holds an **id**, not a card: a snapshot goes stale the moment a field saves,
   * and a stale `revision` is rejected as a conflict on the next one. */
  it('reads the card out of the live list', () => {
    renderManager(
      {
        boards: [makeBoard()],
        activeBoard: makeBoard(),
        cards: [makeCard({ id: 'c1', title: 'Fix the header' })],
      },
      (d) => d.setCardDialog({ mode: 'edit', cardId: 'c1' })
    )
    expect(screen.getByTestId('card-title-display')).toHaveTextContent('Fix the header')
  })

  it('renders nothing for a card the list no longer holds', () => {
    renderManager(
      { boards: [makeBoard()], activeBoard: makeBoard(), cards: [] },
      (d) => d.setCardDialog({ mode: 'edit', cardId: 'gone' })
    )
    expect(screen.queryByTestId('board-card-dialog')).not.toBeInTheDocument()
  })
})

describe('BoardDialogsManager — creating a card', () => {
  it('reopens the new card in the full editor', async () => {
    const created = makeCard({ id: 'c9', title: 'New task' })
    const data = renderManager(
      {
        boards: [makeBoard()],
        activeBoard: makeBoard(),
        cards: [created],
        createCard: vi.fn().mockResolvedValue(created),
      },
      (d) => d.setCardDialog({ mode: 'create', columnId: 'todo' })
    )

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'New task')
    await userEvent.click(screen.getByTestId('board-card-save'))

    expect(data.createCard).toHaveBeenCalledWith('todo', 'New task', '', '', 'task')
    await waitFor(() => expect(screen.getByTestId('card-title-display')).toBeInTheDocument())
  })

  /** A checklist left exactly as the board's template needs no second write — the card already
   * inherited it, so an ordinary new card stays one commit in the board's history. */
  it('does not re-save a checklist identical to the board template', async () => {
    const board = makeBoard({ dodTemplate: '- [ ] Tests pass' })
    const data = renderManager(
      {
        boards: [board],
        activeBoard: board,
        cards: [makeCard({ id: 'c9' })],
        createCard: vi.fn().mockResolvedValue(makeCard({ id: 'c9' })),
      },
      (d) => d.setCardDialog({ mode: 'create', columnId: 'todo' })
    )

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'New task')
    await userEvent.click(screen.getByTestId('board-card-save'))

    await waitFor(() => expect(data.createCard).toHaveBeenCalled())
    expect(data.updateCard).not.toHaveBeenCalled()
  })

  it('saves a checklist the user changed away from the template', async () => {
    const board = makeBoard({ dodTemplate: '- [ ] Tests pass' })
    const data = renderManager(
      {
        boards: [board],
        activeBoard: board,
        cards: [makeCard({ id: 'c9' })],
        createCard: vi.fn().mockResolvedValue(makeCard({ id: 'c9' })),
      },
      (d) => d.setCardDialog({ mode: 'create', columnId: 'todo' })
    )

    await userEvent.type(screen.getByTestId('board-card-title-input'), 'New task')
    // `[[` is userEvent's escape for a literal `[`, which it otherwise reads as a key descriptor.
    await userEvent.type(screen.getByTestId('board-card-dod-input'), '\n- [[ ] Reviewed')
    await userEvent.click(screen.getByTestId('board-card-save'))

    await waitFor(() =>
      expect(data.updateCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'c9' }), {
        dod: '- [ ] Tests pass\n- [ ] Reviewed',
      })
    )
  })
})

/**
 * The archive purge is raised from the archive list and comes back to it — the same origin-trail
 * contract the per-card delete already follows, and the reason `useBoardDialogs` keeps a stack.
 */
describe('BoardDialogsManager — purging the archive', () => {
  const archived = makeCard({ id: 'a1', archivedAt: '2026-08-04T00:00:00.000Z' })

  function openArchive(data: Partial<BoardData> = {}) {
    return renderManager(
      {
        boards: [makeBoard()],
        activeBoard: makeBoard(),
        cards: [archived, makeCard({ id: 'live' })],
        ...data,
      },
      (d) => d.open('archived')
    )
  }

  it('replaces the archive list with the confirmation, counting only archived cards', async () => {
    openArchive()

    await userEvent.click(screen.getByTestId('archived-delete-all'))

    expect(screen.getByTestId('delete-archived-cards-dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('archived-cards-dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Delete 1 archived card?')).toBeInTheDocument()
  })

  it('purges on confirm and drops you back on the archive list', async () => {
    const data = openArchive()

    await userEvent.click(screen.getByTestId('archived-delete-all'))
    await userEvent.click(screen.getByTestId('delete-archived-cards-confirm'))

    expect(data.deleteArchivedCards).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId('archived-cards-dialog')).toBeInTheDocument())
  })

  it('reopens the archive list after cancelling', async () => {
    const data = openArchive()

    await userEvent.click(screen.getByTestId('archived-delete-all'))
    await userEvent.keyboard('{Escape}')

    expect(data.deleteArchivedCards).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('archived-cards-dialog')).toBeInTheDocument())
  })

  /** A closed sprint is a record of what happened, not a drawer to empty. */
  it('offers no purge on a closed sprint', () => {
    openArchive({ activeBoard: makeBoard({ closedAt: '2026-08-05T00:00:00.000Z' }) })

    expect(screen.getByTestId('archived-card-a1')).toBeInTheDocument()
    expect(screen.queryByTestId('archived-danger-zone')).not.toBeInTheDocument()
  })
})

/**
 * The column-wide actions are raised from a column header and confirmed here. The column travels by
 * **id**, so what each dialog names and counts is resolved from the board as it stands, not from a
 * snapshot taken when the menu was opened.
 */
describe('BoardDialogsManager — column-wide actions', () => {
  const board = makeBoard({
    id: 'b1',
    source: 'local',
    columns: [
      { id: 'todo', name: 'To do', order: 0 },
      { id: 'done', name: 'Done', order: 1, isDone: true },
    ],
  })
  const cards = [
    makeCard({ id: 'c1', columnId: 'todo' }),
    makeCard({ id: 'c2', columnId: 'todo' }),
    makeCard({ id: 'away', columnId: 'todo', archivedAt: '2026-08-04T00:00:00.000Z' }),
    makeCard({ id: 'c3', columnId: 'done' }),
  ]

  function openColumnAction(kind: 'archive' | 'move', extra: Partial<BoardData> = {}) {
    return renderManager({ boards: [board], activeBoard: board, cards, ...extra }, (d) =>
      d.setColumnAction({ kind, columnId: 'todo' })
    )
  }

  it('names the column and counts only the cards still on the board', () => {
    openColumnAction('archive')

    expect(screen.getByText('Archive everything in "To do"?')).toBeInTheDocument()
    // Two live cards in `todo`; the archived one is already away and the `done` one is elsewhere.
    expect(screen.getByTestId('archive-column-confirm')).toHaveTextContent('Archive 2 cards')
  })

  it('archives the column on confirm', async () => {
    const data = openColumnAction('archive')

    await userEvent.click(screen.getByTestId('archive-column-confirm'))

    expect(data.archiveColumn).toHaveBeenCalledWith('todo')
  })

  it('moves the column on submit, to the board and column picked', async () => {
    const other = makeBoard({ id: 'b2', source: 'local', name: 'Sprint 13' })
    const data = openColumnAction('move', { boards: [board, other] })

    await userEvent.click(screen.getByTestId('move-column-submit'))

    await waitFor(() =>
      expect(data.moveColumnCards).toHaveBeenCalledWith('todo', 'b2', 'todo')
    )
  })

  it('raises neither dialog until a column action is set', () => {
    renderManager({ boards: [board], activeBoard: board, cards })
    expect(screen.queryByTestId('archive-column-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('move-column-dialog')).not.toBeInTheDocument()
  })
})
