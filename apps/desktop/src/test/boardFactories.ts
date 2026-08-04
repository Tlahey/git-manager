import type { Board, BoardCard, BoardColumn } from '@git-manager/git-types'

/**
 * Shared `Board`/`BoardCard` builders for tests.
 *
 * These live here rather than being redeclared per test file because the board's data model grows:
 * six suites each carried their own copy, so every new required card field broke all six at once.
 * One builder means a new field is defaulted in a single place, and each test keeps overriding only
 * the fields it is actually about.
 */

export function makeColumn(overrides: Partial<BoardColumn> = {}): BoardColumn {
  return { id: 'todo', name: 'To do', order: 0, ...overrides }
}

export function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    id: 'b1',
    name: 'Sprint 12',
    source: 'local',
    columns: [
      { id: 'todo', name: 'To do', order: 0 },
      { id: 'done', name: 'Done', order: 1, isDone: true },
    ],
    revision: 'rev-1',
    tags: [],
    cardPrefixes: [],
    nextCardNumbers: {},
    dodTemplate: '',
    schemaVersion: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function makeCard(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'c1',
    boardId: 'b1',
    columnId: 'todo',
    title: 'Fix the header',
    description: '',
    order: 0,
    revision: 'rev-1',
    prefix: '',
    number: 1,
    kind: 'task',
    links: [],
    priority: 'normal',
    tagIds: [],
    dod: '',
    comments: [],
    schemaVersion: 2,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
