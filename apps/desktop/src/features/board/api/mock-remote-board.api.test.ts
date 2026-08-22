import { describe, it, expect, beforeEach } from 'vitest'
import { mockRemoteBoardBackend, resetMockRemoteBoards } from './mock-remote-board.api'

const path = '/repo'

async function createDemoBoard() {
  return mockRemoteBoardBackend.createBoard(
    path,
    'Support triage',
    [
      { id: 'todo', name: 'To do', order: 0 },
      { id: 'done', name: 'Done', order: 1, isDone: true },
    ],
    '',
    'SUP',
    true
  )
}

describe('mockRemoteBoardBackend', () => {
  beforeEach(() => {
    resetMockRemoteBoards()
  })

  it('creates a board marked as a remote (GitHub) source', async () => {
    const board = await createDemoBoard()
    expect(board.source).toBe('remote')
    expect(board.name).toBe('Support triage')
    expect(board.cardPrefixes).toEqual(['SUP'])
  })

  it('lists boards it created and reads them back with their cards', async () => {
    const board = await createDemoBoard()
    await mockRemoteBoardBackend.createCard(path, board.id, 'todo', {
      title: 'Fix the login bug',
      prefix: 'SUP',
    })

    expect(await mockRemoteBoardBackend.listBoards(path)).toHaveLength(1)
    const detail = await mockRemoteBoardBackend.getBoard(path, board.id)
    expect(detail.cards).toHaveLength(1)
    expect(detail.cards[0].title).toBe('Fix the login bug')
    expect(detail.cards[0].boardId).toBe(board.id)
  })

  it('resets between scenarios so boards do not leak', async () => {
    await createDemoBoard()
    resetMockRemoteBoards()
    expect(await mockRemoteBoardBackend.listBoards(path)).toEqual([])
  })

  it('numbers a created card and offers its prefix even when unseen before', async () => {
    const board = await createDemoBoard()
    const card = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', {
      title: 'Add SSO support',
      prefix: 'AUTH',
    })
    expect(card.number).toBeGreaterThan(0)
    expect(card.prefix).toBe('AUTH')
    const { board: reloaded } = await mockRemoteBoardBackend.getBoard(path, board.id)
    expect(reloaded.cardPrefixes).toContain('AUTH')
  })

  it('updates a card under the expected revision, and rejects a stale one', async () => {
    const board = await createDemoBoard()
    const card = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', {
      title: 'Fix the login bug',
    })

    const updated = await mockRemoteBoardBackend.updateCard(
      path,
      board.id,
      card.id,
      { priority: 'high', columnId: 'done' },
      card.revision
    )
    expect(updated.priority).toBe('high')
    expect(updated.columnId).toBe('done')

    await expect(
      mockRemoteBoardBackend.updateCard(path, board.id, card.id, { priority: 'low' }, card.revision)
    ).rejects.toMatchObject({ code: 'BOARD_CONFLICT' })
  })

  it('moves a card between columns via moveCard', async () => {
    const board = await createDemoBoard()
    const card = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', {
      title: 'Fix the login bug',
    })
    const moved = await mockRemoteBoardBackend.moveCard(
      path,
      board.id,
      card.id,
      'done',
      0,
      card.revision
    )
    expect(moved.columnId).toBe('done')
  })

  it('appends comments without a reply concept, ignoring parentCommentId', async () => {
    const board = await createDemoBoard()
    const card = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', {
      title: 'Fix the login bug',
    })
    const withComment = await mockRemoteBoardBackend.addComment(
      path,
      board.id,
      card.id,
      'Looking into it',
      'some-parent-id',
      card.revision
    )
    expect(withComment.comments).toHaveLength(1)
    expect(withComment.comments[0]).toMatchObject({ body: 'Looking into it' })
    expect(withComment.comments[0].parentCommentId).toBeUndefined()
  })

  it('moves cards to another board, falling back to its first column when none matches', async () => {
    const from = await createDemoBoard()
    const to = await mockRemoteBoardBackend.createBoard(
      path,
      'Next sprint',
      [{ id: 'backlog', name: 'Backlog', order: 0 }],
      '',
      'SUP',
      true
    )
    const card = await mockRemoteBoardBackend.createCard(path, from.id, 'todo', {
      title: 'Carried over',
    })

    await mockRemoteBoardBackend.moveCardsToBoard(path, from.id, to.id, [card.id])

    const fromDetail = await mockRemoteBoardBackend.getBoard(path, from.id)
    const toDetail = await mockRemoteBoardBackend.getBoard(path, to.id)
    expect(fromDetail.cards).toHaveLength(0)
    expect(toDetail.cards).toHaveLength(1)
    expect(toDetail.cards[0].columnId).toBe('backlog')
  })

  it('deletes a single card, and deletes several at once', async () => {
    const board = await createDemoBoard()
    const a = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', { title: 'A' })
    const b = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', { title: 'B' })
    const c = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', { title: 'C' })

    await mockRemoteBoardBackend.deleteCard(path, board.id, a.id)
    const removed = await mockRemoteBoardBackend.deleteCards(path, board.id, [b.id, c.id])

    expect(removed).toBe(2)
    const detail = await mockRemoteBoardBackend.getBoard(path, board.id)
    expect(detail.cards).toHaveLength(0)
  })

  it('archives and un-archives cards, skipping ones already in the requested state', async () => {
    const board = await createDemoBoard()
    const card = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', { title: 'A' })

    const archived = await mockRemoteBoardBackend.setCardsArchived(path, board.id, [card.id], true)
    expect(archived).toBe(1)
    // Already archived — a second call changes nothing.
    expect(await mockRemoteBoardBackend.setCardsArchived(path, board.id, [card.id], true)).toBe(0)

    const restored = await mockRemoteBoardBackend.setCardsArchived(path, board.id, [card.id], false)
    expect(restored).toBe(1)
  })

  it('assigns identifiers only to cards that have none yet', async () => {
    const board = await createDemoBoard()
    const unprefixed = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', {
      title: 'A',
    })
    const prefixed = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', {
      title: 'B',
      prefix: 'SUP',
    })

    const numbered = await mockRemoteBoardBackend.assignCardIdentifiers(path, board.id, 'sup')
    expect(numbered).toBe(1)

    const detail = await mockRemoteBoardBackend.getBoard(path, board.id)
    const after = (id: string) => detail.cards.find((c) => c.id === id)!
    expect(after(unprefixed.id).prefix).toBe('SUP')
    expect(after(prefixed.id).prefix).toBe('SUP')
  })

  it('deleting a board with deleteCards drops it and its cards entirely', async () => {
    const board = await createDemoBoard()
    await mockRemoteBoardBackend.createCard(path, board.id, 'todo', { title: 'A' })

    await mockRemoteBoardBackend.deleteBoard(path, board.id, true)

    expect(await mockRemoteBoardBackend.listBoards(path)).toEqual([])
    await expect(mockRemoteBoardBackend.getBoard(path, board.id)).rejects.toThrow()
  })

  it('deleting a board without deleteCards tombstones it and archives its cards', async () => {
    const board = await createDemoBoard()
    const card = await mockRemoteBoardBackend.createCard(path, board.id, 'todo', { title: 'A' })

    await mockRemoteBoardBackend.deleteBoard(path, board.id, false)

    const [remaining] = await mockRemoteBoardBackend.listBoards(path)
    expect(remaining.deletedAt).toBeDefined()
    const detail = await mockRemoteBoardBackend.getBoard(path, board.id)
    expect(detail.cards.find((c) => c.id === card.id)?.archivedAt).toBeDefined()
  })
})
