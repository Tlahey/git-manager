import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MockIssue } from '../../../app/pull-requests/types'

vi.mock('../../../lib/tauri', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/tauri')>('../../../lib/tauri')
  return { ...actual, readBoardConfig: vi.fn(), writeBoardConfig: vi.fn() }
})

vi.mock('../../../api/github/github-issues.api', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/github/github-issues.api')>('../../../api/github/github-issues.api')
  return {
    ...actual,
    fetchRepoIssues: vi.fn(),
    fetchIssueDetail: vi.fn(),
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    setIssueState: vi.fn(),
  }
})

vi.mock('../../../api/github/github-labels.api', async () => {
  const actual =
    await vi.importActual<typeof import('../../../api/github/github-labels.api')>('../../../api/github/github-labels.api')
  return { ...actual, addLabels: vi.fn(), removeLabel: vi.fn() }
})

import * as tauri from '../../../lib/tauri'
import * as issuesApi from '../../../api/github/github-issues.api'
import * as labelsApi from '../../../api/github/github-labels.api'
import { createRemoteBoardBackend, addExistingIssueToColumn } from './remote-board.api'

const tauriMocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>
const issuesMocked = issuesApi as unknown as Record<string, ReturnType<typeof vi.fn>>
const labelsMocked = labelsApi as unknown as Record<string, ReturnType<typeof vi.fn>>

const path = '/repo'
const backend = createRemoteBoardBackend('acme', 'widgets', 'gh-token')

function configJson(boards: unknown[]) {
  return JSON.stringify({ boards })
}

function mockIssue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: 'gh-issue-1',
    number: 1,
    title: 'Do the thing',
    body: 'Body text',
    repo: 'widgets',
    url: 'https://github.com/acme/widgets/issues/1',
    status: 'open',
    author: 'octocat',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    comments: 0,
    thumbsUp: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  tauriMocked.readBoardConfig.mockResolvedValue(
    configJson([{ id: 'b1', name: 'Board', source: 'remote', columns: [{ id: 'todo', name: 'Todo', order: 0 }], revision: 'r1' }])
  )
})

describe('board config (list/create/update/delete)', () => {
  it('returns no boards when .git-manager/board.json does not exist yet', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(null)
    await expect(backend.listBoards(path)).resolves.toEqual([])
  })

  it('creates a board by appending it to the config file', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(configJson([]))
    tauriMocked.writeBoardConfig.mockResolvedValue(undefined)

    const columns = [{ id: 'todo', name: 'Todo', order: 0 }]
    const board = await backend.createBoard(path, 'My board', columns, '', '', true)

    expect(board.name).toBe('My board')
    expect(board.source).toBe('remote')
    expect(board.columns).toEqual(columns)
    expect(board.id).toMatch(/^[0-9a-f]+$/)

    const [, contents] = tauriMocked.writeBoardConfig.mock.calls[0]
    expect(JSON.parse(contents).boards).toEqual([board])
  })

  it('rejects updating columns with a stale revision instead of silently overwriting', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(
      configJson([{ id: 'b1', name: 'Board', source: 'remote', columns: [], revision: 'rev-1' }])
    )

    await expect(
      backend.updateBoardColumns(path, 'b1', [{ id: 'done', name: 'Done', order: 0 }], 'stale-rev')
    ).rejects.toMatchObject({ code: 'BOARD_CONFLICT' })
    expect(tauriMocked.writeBoardConfig).not.toHaveBeenCalled()
  })

  it('updates columns and bumps the revision when it matches', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(
      configJson([{ id: 'b1', name: 'Board', source: 'remote', columns: [], revision: 'rev-1' }])
    )
    tauriMocked.writeBoardConfig.mockResolvedValue(undefined)

    const updated = await backend.updateBoardColumns(
      path,
      'b1',
      [{ id: 'done', name: 'Done', order: 0 }],
      'rev-1'
    )
    expect(updated.columns).toEqual([{ id: 'done', name: 'Done', order: 0 }])
    expect(updated.revision).not.toBe('rev-1')
  })

  /** Erasing the board is the branch that removes its config entry — the tickets go with it. */
  it('deletes a board by removing it from the config file', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(
      configJson([
        { id: 'b1', name: 'A', source: 'remote', columns: [], revision: 'r1' },
        { id: 'b2', name: 'B', source: 'remote', columns: [], revision: 'r2' },
      ])
    )
    tauriMocked.writeBoardConfig.mockResolvedValue(undefined)
    issuesMocked.fetchRepoIssues.mockResolvedValue([])

    await backend.deleteBoard(path, 'b1', true)

    const [, contents] = tauriMocked.writeBoardConfig.mock.calls.at(-1)!
    expect(JSON.parse(contents).boards.map((b: { id: string }) => b.id)).toEqual(['b2'])
  })

  /**
   * Keeping the tickets means keeping the board: its config entry is what defines the
   * `board:<id>:status:<column>` labels those issues still carry, so removing it would strand them
   * on a board id that resolves to nothing.
   */
  it('tombstones a board whose tickets are archived, leaving it in the config', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(
      configJson([
        { id: 'b1', name: 'A', source: 'remote', columns: [], revision: 'r1' },
        { id: 'b2', name: 'B', source: 'remote', columns: [], revision: 'r2' },
      ])
    )
    tauriMocked.writeBoardConfig.mockResolvedValue(undefined)
    issuesMocked.fetchRepoIssues.mockResolvedValue([])

    await backend.deleteBoard(path, 'b1', false)

    const [, contents] = tauriMocked.writeBoardConfig.mock.calls.at(-1)!
    const boards = JSON.parse(contents).boards as { id: string; deletedAt?: string }[]
    expect(boards.map((b) => b.id)).toEqual(['b1', 'b2'])
    expect(boards.find((b) => b.id === 'b1')?.deletedAt).toBeTruthy()
  })
})

describe('cards derived from issues + labels', () => {
  it('only includes issues carrying this board\'s status label, mapping the label suffix to columnId', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(
      configJson([{ id: 'b1', name: 'Board', source: 'remote', columns: [], revision: 'r1' }])
    )
    issuesMocked.fetchRepoIssues.mockResolvedValue([
      mockIssue({ number: 1, labels: ['board:b1:status:todo'] }),
      mockIssue({ number: 2, labels: ['board:other:status:todo'] }), // different board — excluded
      mockIssue({ number: 3, labels: [] }), // unlabeled — excluded
    ])

    const { cards } = await backend.getBoard(path, 'b1')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ id: '1', columnId: 'todo', boardId: 'b1' })
  })

  it('strips the hidden linkedBranch marker out of the visible description', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(
      configJson([{ id: 'b1', name: 'Board', source: 'remote', columns: [], revision: 'r1' }])
    )
    issuesMocked.fetchRepoIssues.mockResolvedValue([
      mockIssue({
        number: 1,
        labels: ['board:b1:status:todo'],
        body: 'Real description\n\n<!-- git-manager:linkedBranch=feature/x -->',
      }),
    ])

    const { cards } = await backend.getBoard(path, 'b1')
    expect(cards[0].description).toBe('Real description')
    expect(cards[0].linkedBranch).toBe('feature/x')
  })
})

describe('card mutations', () => {
  const rawIssue = (overrides: Partial<issuesApi.GhRawIssue> = {}): issuesApi.GhRawIssue => ({
    number: 1,
    title: 'Task',
    body: '',
    html_url: 'https://github.com/acme/widgets/issues/1',
    state: 'open',
    labels: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  })

  it('creates an issue and labels it into the target column', async () => {
    issuesMocked.createIssue.mockResolvedValue(rawIssue({ number: 5 }))
    issuesMocked.fetchIssueDetail.mockResolvedValue(
      rawIssue({ number: 5, labels: [{ name: 'board:b1:status:todo' }] })
    )
    labelsMocked.addLabels.mockResolvedValue(undefined)

    const card = await backend.createCard(path, 'b1', 'todo', { title: 'Task', description: 'Body' })

    expect(issuesMocked.createIssue).toHaveBeenCalledWith(
      'acme',
      'widgets',
      { title: 'Task', body: 'Body' },
      'gh-token'
    )
    expect(labelsMocked.addLabels).toHaveBeenCalledWith(
      'acme',
      'widgets',
      5,
      ['board:b1:status:todo'],
      'gh-token'
    )
    expect(card.columnId).toBe('todo')
    expect(card.id).toBe('5')
  })

  /** The board *offers* the prefixes its cards carry, so one used for the first time joins the list
   * — the same rule `git_board.rs` applies in the commit that allocates the number. */
  it('adds a prefix used for the first time to the board’s list', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(
      configJson([
        { id: 'b1', name: 'Board', source: 'remote', columns: [], revision: 'r1', cardPrefixes: ['GM'] },
      ])
    )
    tauriMocked.writeBoardConfig.mockResolvedValue(undefined)
    issuesMocked.createIssue.mockResolvedValue(rawIssue({ number: 5 }))
    issuesMocked.fetchIssueDetail.mockResolvedValue(
      rawIssue({ number: 5, labels: [{ name: 'board:b1:status:todo' }] })
    )
    labelsMocked.addLabels.mockResolvedValue(undefined)

    await backend.createCard(path, 'b1', 'todo', { title: 'Task', prefix: 'OPS' })

    const written = JSON.parse(tauriMocked.writeBoardConfig.mock.calls[0][1] as string)
    expect(written.boards[0].cardPrefixes).toEqual(['GM', 'OPS'])
  })

  /**
   * The hidden metadata marker is rewritten whole on every card edit, so a field left out of the
   * recomposition is a field *deleted* from the issue the first time anything else changes.
   */
  it('keeps the prefix and the relations when some other field is edited', async () => {
    tauriMocked.readBoardConfig.mockResolvedValue(
      configJson([{ id: 'b1', name: 'Board', source: 'remote', columns: [], revision: 'r1' }])
    )
    const meta = {
      prefix: 'GM',
      links: [{ targetBoardId: 'b1', targetCardId: '9', kind: 'blocks' }],
    }
    issuesMocked.fetchIssueDetail.mockResolvedValue(
      rawIssue({
        updated_at: 'rev-1',
        labels: [{ name: 'board:b1:status:todo' }],
        body: `Description\n\n<!-- git-manager:meta ${JSON.stringify(meta)} -->`,
      })
    )
    issuesMocked.updateIssue.mockResolvedValue(undefined)
    labelsMocked.addLabels.mockResolvedValue(undefined)

    await backend.updateCard(path, 'b1', '1', { title: 'Renamed' }, 'rev-1')

    const body = issuesMocked.updateIssue.mock.calls[0][3].body as string
    expect(body).toContain('"prefix":"GM"')
    expect(body).toContain('"targetCardId":"9"')
  })

  it('rejects updating a card with a stale revision', async () => {
    issuesMocked.fetchIssueDetail.mockResolvedValue(rawIssue({ updated_at: 'current-rev' }))

    await expect(
      backend.updateCard(path, 'b1', '1', { title: 'New title' }, 'stale-rev')
    ).rejects.toMatchObject({ code: 'BOARD_CONFLICT' })
    expect(issuesMocked.updateIssue).not.toHaveBeenCalled()
  })

  it('swaps the column label when moving a card, leaving other labels untouched', async () => {
    issuesMocked.fetchIssueDetail
      .mockResolvedValueOnce(
        rawIssue({
          updated_at: 'rev-1',
          labels: [{ name: 'board:b1:status:todo' }, { name: 'bug' }],
        })
      )
      .mockResolvedValueOnce(
        rawIssue({ labels: [{ name: 'board:b1:status:done' }, { name: 'bug' }] })
      )
    labelsMocked.removeLabel.mockResolvedValue(undefined)
    labelsMocked.addLabels.mockResolvedValue(undefined)

    const moved = await backend.moveCard(path, 'b1', '1', 'done', 0, 'rev-1')

    expect(labelsMocked.removeLabel).toHaveBeenCalledWith(
      'acme',
      'widgets',
      1,
      'board:b1:status:todo',
      'gh-token'
    )
    expect(labelsMocked.addLabels).toHaveBeenCalledWith(
      'acme',
      'widgets',
      1,
      ['board:b1:status:done'],
      'gh-token'
    )
    expect(moved.columnId).toBe('done')
  })

  it('closes the issue on delete', async () => {
    issuesMocked.setIssueState.mockResolvedValue(undefined)
    await backend.deleteCard(path, 'b1', '1')
    expect(issuesMocked.setIssueState).toHaveBeenCalledWith(
      'acme',
      'widgets',
      1,
      'closed',
      'gh-token'
    )
  })
})

describe('addExistingIssueToColumn', () => {
  it('labels the existing issue into the target column without creating a new issue', async () => {
    labelsMocked.addLabels.mockResolvedValue(undefined)
    await addExistingIssueToColumn('acme', 'widgets', 'gh-token', 'b1', 7, 'todo')

    expect(labelsMocked.addLabels).toHaveBeenCalledWith(
      'acme',
      'widgets',
      7,
      ['board:b1:status:todo'],
      'gh-token'
    )
    expect(issuesMocked.createIssue).not.toHaveBeenCalled()
  })
})
