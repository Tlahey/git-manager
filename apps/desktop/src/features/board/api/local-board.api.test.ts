import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/tauri')>('../../../lib/tauri')
  return {
    ...actual,
    listBoards: vi.fn(),
    getBoard: vi.fn(),
    createBoard: vi.fn(),
    updateBoardColumns: vi.fn(),
    deleteBoard: vi.fn(),
    createBoardCard: vi.fn(),
    updateBoardCard: vi.fn(),
    addBoardCardComment: vi.fn(),
    moveBoardCard: vi.fn(),
    deleteBoardCard: vi.fn(),
    assignBoardCardIdentifiers: vi.fn(),
    getBoardHistory: vi.fn(),
    listRecoverableBoards: vi.fn(),
    restoreBoardBackup: vi.fn(),
  }
})

import * as tauri from '../../../lib/tauri'
import {
  localBoardBackend,
  apiGetBoardHistory,
  apiListRecoverableBoards,
  apiRestoreBoardBackup,
} from './local-board.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>
const path = '/repo'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('localBoardBackend', () => {
  it('forwards listBoards/getBoard reads straight through', async () => {
    mocked.listBoards.mockResolvedValue(['board'])
    mocked.getBoard.mockResolvedValue({ board: 'b', cards: [] })

    await expect(localBoardBackend.listBoards(path)).resolves.toEqual(['board'])
    expect(mocked.listBoards).toHaveBeenCalledWith(path)

    await expect(localBoardBackend.getBoard(path, 'b1')).resolves.toEqual({ board: 'b', cards: [] })
    expect(mocked.getBoard).toHaveBeenCalledWith(path, 'b1')
  })

  it('forwards createBoard/updateBoardColumns/deleteBoard with their exact args', async () => {
    mocked.createBoard.mockResolvedValue('created')
    mocked.updateBoardColumns.mockResolvedValue('updated')
    mocked.deleteBoard.mockResolvedValue(undefined)

    const columns = [{ id: 'todo', name: 'Todo', order: 0 }]
    await expect(
      localBoardBackend.createBoard(path, 'My board', columns, '- [ ] Done', 'GM', true)
    ).resolves.toBe('created')
    expect(mocked.createBoard).toHaveBeenCalledWith(
      path,
      'My board',
      columns,
      '- [ ] Done',
      'GM',
      true
    )

    await expect(localBoardBackend.updateBoardColumns(path, 'b1', columns, 'rev-1')).resolves.toBe(
      'updated'
    )
    expect(mocked.updateBoardColumns).toHaveBeenCalledWith(path, 'b1', columns, 'rev-1')

    await localBoardBackend.deleteBoard(path, 'b1', true)
    expect(mocked.deleteBoard).toHaveBeenCalledWith(path, 'b1', true)
  })

  it('forwards card create/update/move/delete with their exact args', async () => {
    mocked.createBoardCard.mockResolvedValue('card')
    mocked.updateBoardCard.mockResolvedValue('updated-card')
    mocked.moveBoardCard.mockResolvedValue('moved-card')
    mocked.deleteBoardCard.mockResolvedValue(undefined)

    await expect(
      localBoardBackend.createCard(path, 'b1', 'todo', { title: 'Title', description: 'Body' })
    ).resolves.toBe('card')
    expect(mocked.createBoardCard).toHaveBeenCalledWith(path, 'b1', 'todo', {
      title: 'Title',
      description: 'Body',
    })

    // The card's own identity travels as one object — prefix, kind and the issue it tracks.
    const card = {
      title: 'Title',
      description: 'Body',
      prefix: 'GM',
      kind: 'bug' as const,
      sourceIssue: { owner: 'acme', repo: 'widgets', number: 42 },
    }
    await localBoardBackend.createCard(path, 'b1', 'todo', card)
    expect(mocked.createBoardCard).toHaveBeenLastCalledWith(path, 'b1', 'todo', card)

    const patch = { title: 'New title' }
    await expect(localBoardBackend.updateCard(path, 'b1', 'c1', patch, 'rev-1')).resolves.toBe(
      'updated-card'
    )
    expect(mocked.updateBoardCard).toHaveBeenCalledWith(path, 'b1', 'c1', patch, 'rev-1')

    await expect(localBoardBackend.moveCard(path, 'b1', 'c1', 'done', 2, 'rev-1')).resolves.toBe(
      'moved-card'
    )
    expect(mocked.moveBoardCard).toHaveBeenCalledWith(path, 'b1', 'c1', 'done', 2, 'rev-1')

    await localBoardBackend.deleteCard(path, 'b1', 'c1')
    expect(mocked.deleteBoardCard).toHaveBeenCalledWith(path, 'b1', 'c1')
  })

  it('forwards addComment with the parent comment id in position', async () => {
    mocked.addBoardCardComment.mockResolvedValue('commented-card')

    await expect(
      localBoardBackend.addComment(path, 'b1', 'c1', 'body', 'parent-1', 'rev-1')
    ).resolves.toBe('commented-card')
    expect(mocked.addBoardCardComment).toHaveBeenCalledWith(
      path,
      'b1',
      'c1',
      'body',
      'parent-1',
      'rev-1'
    )
  })

  /** The retrofit for a board created before it offered a prefix — one command, one board commit,
   * resolving with how many cards were numbered. */
  it('forwards the identifier assignment and returns the count', async () => {
    mocked.assignBoardCardIdentifiers.mockResolvedValue(3)

    await expect(localBoardBackend.assignCardIdentifiers(path, 'b1', 'GM')).resolves.toBe(3)
    expect(mocked.assignBoardCardIdentifiers).toHaveBeenCalledWith(path, 'b1', 'GM')
  })

  it('propagates a rejection (e.g. a BOARD_CONFLICT error) without swallowing it', async () => {
    const conflict = Object.assign(new Error('Board changed since it was last read'), {
      code: 'BOARD_CONFLICT',
    })
    mocked.updateBoardCard.mockRejectedValue(conflict)

    await expect(
      localBoardBackend.updateCard(path, 'b1', 'c1', { title: 'x' }, 'stale-rev')
    ).rejects.toBe(conflict)
  })
})

describe('local-only board helpers', () => {
  it('forwards board history / recoverable-boards / restore-backup calls', async () => {
    mocked.getBoardHistory.mockResolvedValue(['commit'])
    mocked.listRecoverableBoards.mockResolvedValue(['recoverable'])
    mocked.restoreBoardBackup.mockResolvedValue('restored')

    await expect(apiGetBoardHistory(path, 'b1')).resolves.toEqual(['commit'])
    expect(mocked.getBoardHistory).toHaveBeenCalledWith(path, 'b1')

    await expect(apiListRecoverableBoards(path)).resolves.toEqual(['recoverable'])
    expect(mocked.listRecoverableBoards).toHaveBeenCalledWith(path)

    await expect(apiRestoreBoardBackup(path, 'b1')).resolves.toBe('restored')
    expect(mocked.restoreBoardBackup).toHaveBeenCalledWith(path, 'b1')
  })
})
