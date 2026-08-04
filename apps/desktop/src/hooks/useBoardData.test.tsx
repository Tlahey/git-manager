import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { Board, BoardCard } from '@git-manager/git-types'
import { useBoardStore } from '../stores/board.store'

vi.mock('./useRepoGitHub', () => ({
  useRepoGitHub: vi.fn(() => ({ ownerRepo: null, token: null })),
}))

const { localBackend, remoteBackendFactory, remoteBackend } = vi.hoisted(() => {
  const makeBackend = () => ({
    listBoards: vi.fn(),
    getBoard: vi.fn(),
    createBoard: vi.fn(),
    updateBoardColumns: vi.fn(),
    deleteBoard: vi.fn(),
    updateBoardMeta: vi.fn(),
    closeBoard: vi.fn(),
    createCard: vi.fn(),
    updateCard: vi.fn(),
    addComment: vi.fn(),
    moveCard: vi.fn(),
    moveCardsToBoard: vi.fn(),
    deleteCard: vi.fn(),
  })
  const remote = makeBackend()
  return { localBackend: makeBackend(), remoteBackend: remote, remoteBackendFactory: vi.fn(() => remote) }
})

const {
  addExistingIssueToColumn,
  createIssueComment,
  fetchRemoteCardComments,
  fetchIssueForTracking,
  mergeTrackedIssues,
  pushCardToIssue,
} = vi.hoisted(() => ({
  addExistingIssueToColumn: vi.fn(),
  createIssueComment: vi.fn(),
  fetchRemoteCardComments: vi.fn(),
  fetchIssueForTracking: vi.fn(),
  // Default: pass the stored cards straight through, so a test that isn't about tracking sees the
  // board exactly as the backend returned it.
  mergeTrackedIssues: vi.fn((_board, cards) => Promise.resolve(cards)),
  pushCardToIssue: vi.fn(),
}))

vi.mock('../api/board/local-board.api', () => ({ localBoardBackend: localBackend }))
vi.mock('../api/board/remote-board.api', () => ({
  createRemoteBoardBackend: remoteBackendFactory,
  addExistingIssueToColumn,
  fetchRemoteCardComments,
}))
vi.mock('../api/board/trackedIssue.api', () => ({
  fetchIssueForTracking,
  mergeTrackedIssues,
  pushCardToIssue,
}))
vi.mock('../api/github.api', () => ({ createIssueComment }))

import { makeBoard, makeCard } from '../test/boardFactories'
import { useRepoGitHub } from './useRepoGitHub'
import { useBoardData } from './useBoardData'

const mockedUseRepoGitHub = useRepoGitHub as unknown as ReturnType<typeof vi.fn>
const path = '/repo'

function board(overrides: Partial<Board> = {}): Board {
  return makeBoard({ name: 'Board', columns: [{ id: 'todo', name: 'Todo', order: 0 }], ...overrides })
}

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  return makeCard({ title: 'Task', ...overrides })
}

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseRepoGitHub.mockReturnValue({ ownerRepo: null, token: null })
  useBoardStore.setState({ activeBoardIdByRepo: {}, collapsedColumns: {} })
  localBackend.listBoards.mockResolvedValue([])
})

describe('useBoardData', () => {
  it('lists only local boards when the repo has no connected GitHub account', async () => {
    localBackend.listBoards.mockResolvedValue([board()])

    const { result } = renderHook(() => useBoardData(path), { wrapper })

    await waitFor(() => expect(result.current.boards).toHaveLength(1))
    expect(result.current.canUseRemote).toBe(false)
    expect(remoteBackendFactory).not.toHaveBeenCalled()
  })

  it('merges local and remote boards when a GitHub account is connected', async () => {
    mockedUseRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'acme', repo: 'widgets' }, token: 'tok' })
    localBackend.listBoards.mockResolvedValue([board({ id: 'local-1', source: 'local' })])
    remoteBackend.listBoards.mockResolvedValue([board({ id: 'remote-1', source: 'remote' })])

    const { result } = renderHook(() => useBoardData(path), { wrapper })

    await waitFor(() => expect(result.current.boards).toHaveLength(2))
    expect(result.current.canUseRemote).toBe(true)
    expect(remoteBackendFactory).toHaveBeenCalledWith('acme', 'widgets', 'tok')
  })

  it('defaults the active board to the first one and fetches its cards from the matching backend', async () => {
    localBackend.listBoards.mockResolvedValue([board()])
    localBackend.getBoard.mockResolvedValue({ board: board(), cards: [card()] })

    const { result } = renderHook(() => useBoardData(path), { wrapper })

    await waitFor(() => expect(result.current.activeBoard?.id).toBe('b1'))
    await waitFor(() => expect(result.current.cards).toHaveLength(1))
    expect(localBackend.getBoard).toHaveBeenCalledWith(path, 'b1')
  })

  it('dispatches a card move to the backend matching the active board source', async () => {
    localBackend.listBoards.mockResolvedValue([board()])
    localBackend.getBoard.mockResolvedValue({ board: board(), cards: [card()] })
    localBackend.moveCard.mockResolvedValue(card({ columnId: 'done', order: 0 }))

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.moveCard(card(), 'done', 0)
    })

    expect(localBackend.moveCard).toHaveBeenCalledWith(path, 'b1', 'c1', 'done', 0, 'rev-1')
  })

  it('on a BOARD_CONFLICT error, refreshes instead of throwing', async () => {
    localBackend.listBoards.mockResolvedValue([board()])
    localBackend.getBoard.mockResolvedValue({ board: board(), cards: [card()] })
    localBackend.updateCard.mockRejectedValue(
      Object.assign(new Error('stale'), { code: 'BOARD_CONFLICT' })
    )

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    const outcome = await act(async () => result.current.updateCard(card(), { title: 'New' }))
    expect(outcome).toBeNull()
    // getBoard is called once on initial load and once more when the conflict refreshes the detail.
    expect(localBackend.getBoard).toHaveBeenCalledTimes(2)
  })

  it('propagates a non-conflict error from a mutation', async () => {
    localBackend.listBoards.mockResolvedValue([board()])
    localBackend.getBoard.mockResolvedValue({ board: board(), cards: [card()] })
    localBackend.updateCard.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await expect(
      act(async () => result.current.updateCard(card(), { title: 'New' }))
    ).rejects.toThrow('boom')
  })

  it('sets the newly created board as active', async () => {
    localBackend.listBoards.mockResolvedValue([])
    localBackend.createBoard.mockResolvedValue(board({ id: 'new-board' }))

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.boardsLoading).toBe(false))

    await act(async () => {
      await result.current.createBoard('New board', [{ id: 'todo', name: 'Todo', order: 0 }], 'local')
    })

    expect(useBoardStore.getState().activeBoardIdByRepo[path]).toBe('new-board')
  })

  it('converts a local card to a GitHub issue, then removes the local card', async () => {
    mockedUseRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'acme', repo: 'widgets' }, token: 'tok' })
    localBackend.listBoards.mockResolvedValue([board()])
    remoteBackend.listBoards.mockResolvedValue([])
    localBackend.getBoard.mockResolvedValue({ board: board(), cards: [card()] })
    remoteBackend.createCard.mockResolvedValue(card({ id: 'gh-9' }))
    localBackend.deleteCard.mockResolvedValue(undefined)

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.convertCardToIssue(card(), 'remote-board', 'todo')
    })

    expect(remoteBackend.createCard).toHaveBeenCalledWith(path, 'remote-board', 'todo', {
      title: 'Task',
      description: '',
      prefix: '',
      kind: 'task',
    })
    expect(localBackend.deleteCard).toHaveBeenCalledWith(path, 'b1', 'c1')
  })

  it('rejects converting to an issue without a connected GitHub account', async () => {
    localBackend.listBoards.mockResolvedValue([board()])
    localBackend.getBoard.mockResolvedValue({ board: board(), cards: [card()] })

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await expect(
      act(async () => result.current.convertCardToIssue(card(), 'remote-board', 'todo'))
    ).rejects.toThrow('no connected GitHub account')
  })

  /** The card is *tracked*, not copied: it carries the link back to the issue, which is what makes
   * the issue — not this card — the source of truth for its content from here on. */
  it('adding an issue to a local board creates a card tracking it', async () => {
    mockedUseRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'acme', repo: 'widgets' }, token: 'tok' })
    localBackend.listBoards.mockResolvedValue([board()])
    remoteBackend.listBoards.mockResolvedValue([])
    localBackend.getBoard.mockResolvedValue({ board: board(), cards: [] })
    fetchIssueForTracking.mockResolvedValue({
      number: 9,
      title: 'Imported issue',
      body: 'Imported body',
      updatedAt: '2026-08-04T10:00:00Z',
      labels: [],
      assignees: [],
      state: 'open',
    })
    localBackend.createCard.mockResolvedValue(card({ id: 'imported' }))

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.activeBoard?.id).toBe('b1'))

    await act(async () => {
      await result.current.addIssueToBoard(9, 'todo')
    })

    const ref = { owner: 'acme', repo: 'widgets', number: 9 }
    expect(fetchIssueForTracking).toHaveBeenCalledWith(ref, 'tok')
    expect(localBackend.createCard).toHaveBeenCalledWith(path, 'b1', 'todo', {
      title: 'Imported issue',
      description: 'Imported body',
      sourceIssue: ref,
    })
  })

  it('adding an issue to a remote board just labels the existing issue', async () => {
    mockedUseRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'acme', repo: 'widgets' }, token: 'tok' })
    const remote = board({ id: 'r1', source: 'remote' })
    localBackend.listBoards.mockResolvedValue([])
    remoteBackend.listBoards.mockResolvedValue([remote])
    remoteBackend.getBoard.mockResolvedValue({ board: remote, cards: [] })
    addExistingIssueToColumn.mockResolvedValue(undefined)

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.activeBoard?.id).toBe('r1'))

    await act(async () => {
      await result.current.addIssueToBoard(9, 'todo')
    })

    expect(addExistingIssueToColumn).toHaveBeenCalledWith('acme', 'widgets', 'tok', 'r1', 9, 'todo')
    // No card is created and no issue is opened: the issue itself becomes the card, via its label.
    expect(fetchIssueForTracking).not.toHaveBeenCalled()
    expect(localBackend.createCard).not.toHaveBeenCalled()
  })
})

/**
 * A tracked card on a local board splits ownership: the issue holds the content, the board holds the
 * placement. These pin which write goes where — and in which order, since getting that backwards is
 * what makes a card claim an edit its issue never received.
 */
describe('useBoardData — tracked cards', () => {
  const ref = { owner: 'acme', repo: 'widgets', number: 42 }

  function withTrackedCard(overrides: Partial<BoardCard> = {}) {
    mockedUseRepoGitHub.mockReturnValue({
      ownerRepo: { owner: 'acme', repo: 'widgets' },
      token: 'tok',
    })
    const tracked = card({ id: 'c1', sourceIssue: ref, ...overrides })
    localBackend.listBoards.mockResolvedValue([board()])
    remoteBackend.listBoards.mockResolvedValue([])
    localBackend.getBoard.mockResolvedValue({ board: board(), cards: [tracked] })
    localBackend.updateCard.mockResolvedValue(tracked)
    return tracked
  }

  it('merges the tracked issues into the board it just read', async () => {
    withTrackedCard()
    mergeTrackedIssues.mockResolvedValueOnce([card({ id: 'c1', title: 'From the issue' })])

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    expect(result.current.cards[0].title).toBe('From the issue')
  })

  it('sends an issue-owned field to GitHub before writing it locally', async () => {
    const tracked = withTrackedCard()
    const order: string[] = []
    pushCardToIssue.mockImplementation(() => {
      order.push('github')
      return Promise.resolve()
    })
    localBackend.updateCard.mockImplementation(() => {
      order.push('local')
      return Promise.resolve(tracked)
    })

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.updateCard(tracked, { title: 'Renamed' })
    })

    expect(order).toEqual(['github', 'local'])
    expect(pushCardToIssue).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b1' }),
      expect.objectContaining({ title: 'Renamed' }),
      ref,
      'tok'
    )
  })

  /** A failed GitHub write must leave the local card alone, or the two quietly disagree. */
  it('does not write locally when the issue write fails', async () => {
    const tracked = withTrackedCard()
    pushCardToIssue.mockRejectedValue(new Error('GitHub is down'))

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await expect(
      act(async () => {
        await result.current.updateCard(tracked, { title: 'Renamed' })
      })
    ).rejects.toThrow()
    expect(localBackend.updateCard).not.toHaveBeenCalled()
  })

  /** Placement has no GitHub-native home, so moving a card must not touch the issue at all. */
  it('keeps a placement-only patch entirely local', async () => {
    const tracked = withTrackedCard()

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.updateCard(tracked, { columnId: 'done' })
    })

    expect(pushCardToIssue).not.toHaveBeenCalled()
    expect(localBackend.updateCard).toHaveBeenCalled()
  })

  it('posts a comment to the issue rather than onto the card', async () => {
    const tracked = withTrackedCard()

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.addComment(tracked, 'Looks good')
    })

    expect(createIssueComment).toHaveBeenCalledWith('acme', 'widgets', 42, 'Looks good', 'tok')
    expect(localBackend.addComment).not.toHaveBeenCalled()
  })

  it('reads a tracked card’s comments from its issue', async () => {
    const tracked = withTrackedCard()
    fetchRemoteCardComments.mockResolvedValue([])

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.loadComments(tracked)
    })

    expect(fetchRemoteCardComments).toHaveBeenCalledWith('acme', 'widgets', 'tok', '42')
  })

  /**
   * The picker greys these out, but it isn't the only way in — a pasted reference reaches the hook
   * directly, so the refusal has to live here too.
   */
  it('refuses to add an issue a card already tracks', async () => {
    withTrackedCard()

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))
    expect(result.current.trackedIssueNumbers).toEqual([42])

    await act(async () => {
      await result.current.addIssueToBoard(42, 'todo')
    })

    expect(fetchIssueForTracking).not.toHaveBeenCalled()
    expect(localBackend.createCard).not.toHaveBeenCalled()
  })

  /** An archived card still speaks for its issue — adding a second one would resurrect it under a
   * different id. */
  it('counts an archived card as still tracking its issue', async () => {
    withTrackedCard({ archivedAt: '2026-08-04T00:00:00.000Z' })

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.addIssueToBoard(42, 'todo')
    })

    expect(localBackend.createCard).not.toHaveBeenCalled()
  })

  it('untracks by clearing the link, without touching the issue', async () => {
    const tracked = withTrackedCard()

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.untrackCard(tracked)
    })

    expect(pushCardToIssue).not.toHaveBeenCalled()
    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b1',
      'c1',
      { sourceIssue: null },
      tracked.revision
    )
  })

  /** Without a token nothing can be fetched or written, so the card stays an ordinary local one
   * rather than half-tracked. */
  it('leaves a tracked card alone when no GitHub account is connected', async () => {
    mockedUseRepoGitHub.mockReturnValue({ ownerRepo: null, token: null })
    const tracked = card({ id: 'c1', sourceIssue: ref })
    localBackend.listBoards.mockResolvedValue([board()])
    localBackend.getBoard.mockResolvedValue({ board: board(), cards: [tracked] })
    localBackend.updateCard.mockResolvedValue(tracked)

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.cards).toHaveLength(1))

    await act(async () => {
      await result.current.updateCard(tracked, { title: 'Renamed' })
    })

    expect(mergeTrackedIssues).not.toHaveBeenCalled()
    expect(pushCardToIssue).not.toHaveBeenCalled()
    expect(localBackend.updateCard).toHaveBeenCalled()
  })
})

/**
 * On the local backend a card's `revision` is the *board's* ref tip — a whole-board version stamp.
 * Creating a tag writes the palette and moves it, so assigning that tag to the card has to be built
 * from a re-read card. Doing it from the values captured before the write is a guaranteed
 * `BOARD_CONFLICT`, which is exactly the bug this covers.
 */
describe('useBoardData — creating a tag from a card', () => {
  async function mountWithCard() {
    const local = board({ revision: 'rev-1', tags: [] })
    const card = makeCard({ id: 'c1', revision: 'rev-1', tagIds: [] })
    localBackend.listBoards.mockResolvedValue([local])
    localBackend.getBoard.mockResolvedValue({ board: local, cards: [card] })
    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.activeBoard?.id).toBe('b1'))
    return { result, card }
  }

  it('assigns the tag using the revision the palette write produced, not the stale one', async () => {
    const { result, card } = await mountWithCard()
    const before = board({ revision: 'rev-1', tags: [] })
    const after = board({
      revision: 'rev-2',
      tags: [{ id: 'frontend', name: 'frontend', color: '#3b82f6' }],
    })

    // The backend is modelled as it really behaves: a read reflects whether the palette write has
    // landed, and that write advances the revision every card then carries.
    let paletteWritten = false
    localBackend.updateBoardMeta.mockImplementation(async () => {
      paletteWritten = true
      return after
    })
    localBackend.getBoard.mockImplementation(async () =>
      paletteWritten
        ? { board: after, cards: [{ ...card, revision: 'rev-2' }] }
        : { board: before, cards: [{ ...card, revision: 'rev-1' }] }
    )
    localBackend.updateCard.mockResolvedValue({ ...card, revision: 'rev-3', tagIds: ['frontend'] })

    await act(async () => {
      await result.current.createTagAndAssign(card, 'frontend')
    })

    expect(localBackend.updateBoardMeta).toHaveBeenCalledWith(
      path,
      'b1',
      'Board',
      [expect.objectContaining({ id: 'frontend', name: 'frontend' })],
      '',
      [],
      'rev-1'
    )
    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b1',
      'c1',
      { tagIds: ['frontend'] },
      'rev-2'
    )
  })

  it('reuses an existing tag instead of writing the palette again', async () => {
    const local = board({ revision: 'rev-1', tags: [{ id: 'bug', name: 'bug', color: '#ff0000' }] })
    const card = makeCard({ id: 'c1', revision: 'rev-1', tagIds: [] })
    localBackend.listBoards.mockResolvedValue([local])
    localBackend.getBoard.mockResolvedValue({ board: local, cards: [card] })
    localBackend.updateCard.mockResolvedValue({ ...card, tagIds: ['bug'] })

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.activeBoard?.id).toBe('b1'))

    await act(async () => {
      await result.current.createTagAndAssign(card, 'Bug')
    })

    expect(localBackend.updateBoardMeta).not.toHaveBeenCalled()
    expect(localBackend.updateCard).toHaveBeenCalledWith(
      path,
      'b1',
      'c1',
      { tagIds: ['bug'] },
      'rev-1'
    )
  })

  it('does nothing for a blank name', async () => {
    const { result, card } = await mountWithCard()
    await act(async () => {
      await result.current.createTagAndAssign(card, '   ')
    })
    expect(localBackend.updateBoardMeta).not.toHaveBeenCalled()
    expect(localBackend.updateCard).not.toHaveBeenCalled()
  })
})

describe('useBoardData — comments', () => {
  it('reads a local card’s comments straight off the card, without a fetch', async () => {
    const local = board()
    const card = makeCard({
      comments: [{ id: 'k1', author: 'Ada', body: 'Hi', createdAt: '2026-08-01T00:00:00.000Z' }],
    })
    localBackend.listBoards.mockResolvedValue([local])
    localBackend.getBoard.mockResolvedValue({ board: local, cards: [card] })

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.activeBoard?.id).toBe('b1'))

    await expect(result.current.loadComments(card)).resolves.toEqual(card.comments)
    expect(fetchRemoteCardComments).not.toHaveBeenCalled()
  })

  it('fetches a remote card’s comments from GitHub', async () => {
    mockedUseRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'acme', repo: 'widgets' }, token: 'tok' })
    const remote = board({ id: 'r1', source: 'remote' })
    const card = makeCard({ id: '42', boardId: 'r1' })
    localBackend.listBoards.mockResolvedValue([])
    remoteBackend.listBoards.mockResolvedValue([remote])
    remoteBackend.getBoard.mockResolvedValue({ board: remote, cards: [card] })
    fetchRemoteCardComments.mockResolvedValue([
      { id: '7', author: 'grace', body: 'Shipping', createdAt: '2026-08-02T00:00:00.000Z' },
    ])

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.activeBoard?.id).toBe('r1'))

    const comments = await result.current.loadComments(card)
    expect(fetchRemoteCardComments).toHaveBeenCalledWith('acme', 'widgets', 'tok', '42')
    expect(comments[0].author).toBe('grace')
  })

  it('refuses to post an empty comment', async () => {
    const local = board()
    localBackend.listBoards.mockResolvedValue([local])
    localBackend.getBoard.mockResolvedValue({ board: local, cards: [] })

    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.activeBoard?.id).toBe('b1'))

    await act(async () => {
      await result.current.addComment(makeCard(), '   ')
    })
    expect(localBackend.addComment).not.toHaveBeenCalled()
  })
})

/**
 * The order matters and is the thing worth pinning: the successor board is created and filled
 * *before* the original is closed, so a failure part-way leaves a sprint that is still open and
 * still owns its cards — recoverable by retrying — rather than a closed, read-only sprint whose work
 * has nowhere to go.
 */
describe('useBoardData — closing a sprint', () => {
  const summary = {
    closedAt: '2026-08-04T10:00:00.000Z',
    totalCards: 2,
    doneCards: 1,
    unfinishedCards: 1,
    completionRate: 50,
    blockedCards: 0,
    overdueCards: 0,
    byColumn: [],
    byPriority: [],
    byAssignee: [],
  }

  async function mountWithBoard() {
    const local = board()
    localBackend.listBoards.mockResolvedValue([local])
    localBackend.getBoard.mockResolvedValue({ board: local, cards: [] })
    const { result } = renderHook(() => useBoardData(path), { wrapper })
    await waitFor(() => expect(result.current.activeBoard?.id).toBe('b1'))
    return result
  }

  it('creates the successor, moves the leftovers into it, then closes the original', async () => {
    const calls: string[] = []
    localBackend.createBoard.mockImplementation(async () => {
      calls.push('createBoard')
      return board({ id: 'b2', name: 'Sprint 13' })
    })
    localBackend.moveCardsToBoard.mockImplementation(async () => {
      calls.push('moveCards')
    })
    localBackend.closeBoard.mockImplementation(async () => {
      calls.push('closeBoard')
      return board({ closedAt: summary.closedAt })
    })

    const result = await mountWithBoard()
    await act(async () => {
      await result.current.closeSprint(summary, { name: 'Sprint 13', carryOverCardIds: ['c1'] })
    })

    expect(calls).toEqual(['createBoard', 'moveCards', 'closeBoard'])
    expect(localBackend.moveCardsToBoard).toHaveBeenCalledWith(path, 'b1', 'b2', ['c1'])
    // The successor's id is stamped on the frozen summary, so the archive says where the work went.
    expect(localBackend.closeBoard).toHaveBeenCalledWith(
      path,
      'b1',
      expect.objectContaining({ carriedOverToBoardId: 'b2' }),
      'rev-1'
    )
  })

  it('closes without a successor when no carry-over is asked for', async () => {
    localBackend.closeBoard.mockResolvedValue(board({ closedAt: summary.closedAt }))

    const result = await mountWithBoard()
    await act(async () => {
      await result.current.closeSprint(summary, null)
    })

    expect(localBackend.createBoard).not.toHaveBeenCalled()
    expect(localBackend.moveCardsToBoard).not.toHaveBeenCalled()
    expect(localBackend.closeBoard).toHaveBeenCalledWith(
      path,
      'b1',
      expect.objectContaining({ carriedOverToBoardId: undefined }),
      'rev-1'
    )
  })

  it('skips the move when the sprint finished everything', async () => {
    localBackend.createBoard.mockResolvedValue(board({ id: 'b2' }))
    localBackend.closeBoard.mockResolvedValue(board({ closedAt: summary.closedAt }))

    const result = await mountWithBoard()
    await act(async () => {
      await result.current.closeSprint(summary, { name: 'Sprint 13', carryOverCardIds: [] })
    })

    expect(localBackend.createBoard).toHaveBeenCalled()
    expect(localBackend.moveCardsToBoard).not.toHaveBeenCalled()
  })
})
