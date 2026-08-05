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
