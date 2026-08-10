import { describe, it, expect, vi, beforeEach } from 'vitest'

const readBoardConfig = vi.fn()
const writeBoardConfig = vi.fn()
vi.mock('../../../lib/tauri', () => ({
  readBoardConfig: (...a: unknown[]) => readBoardConfig(...a),
  writeBoardConfig: (...a: unknown[]) => writeBoardConfig(...a),
}))

import { readConfigFile, writeConfigFile, generateBoardId } from './remoteBoardConfigFile'

beforeEach(() => vi.clearAllMocks())

const withRaw = (raw: string | null) => readBoardConfig.mockResolvedValue(raw)

describe('readConfigFile — a board.json that is not there or not valid', () => {
  /**
   * The file is committed to the repository, so it can arrive broken from a bad merge. Refusing to
   * open the repo over it would be a worse answer than an empty board list the user can rebuild.
   */
  it('reads an absent file as no boards', async () => {
    withRaw(null)
    expect(await readConfigFile('/repo')).toEqual({ boards: [] })
  })

  it('reads malformed JSON as no boards rather than throwing', async () => {
    withRaw('{ not json')
    await expect(readConfigFile('/repo')).resolves.toEqual({ boards: [] })
  })

  it('reads a file whose `boards` is not an array as no boards', async () => {
    withRaw(JSON.stringify({ boards: 'nope' }))
    expect(await readConfigFile('/repo')).toEqual({ boards: [] })
  })
})

describe('readConfigFile — boards written by older versions', () => {
  /** Each default stands for a release; a board missing all of them still comes back complete. */
  it('fills in every field the current format added', async () => {
    withRaw(JSON.stringify({ boards: [{ id: 'a', name: 'Board', columns: [] }] }))
    const { boards } = await readConfigFile('/repo')
    expect(boards[0]).toMatchObject({
      id: 'a',
      tags: [],
      dodTemplate: '',
      cardPrefixes: [],
      nextCardNumbers: {},
    })
  })

  /** The single `cardPrefix` predates the list; it becomes the list's only entry. */
  it('promotes a legacy single cardPrefix into the list', async () => {
    withRaw(JSON.stringify({ boards: [{ id: 'a', cardPrefix: 'GM' }] }))
    const { boards } = await readConfigFile('/repo')
    expect(boards[0].cardPrefixes).toEqual(['GM'])
  })

  /** An empty legacy prefix is dropped, not promoted — a prefix of '' would number every card `-1`. */
  it('drops an empty legacy cardPrefix instead of promoting it', async () => {
    withRaw(JSON.stringify({ boards: [{ id: 'a', cardPrefix: '' }] }))
    const { boards } = await readConfigFile('/repo')
    expect(boards[0].cardPrefixes).toEqual([])
  })

  it('leaves a board that is already current untouched', async () => {
    const current = {
      id: 'a',
      tags: ['x'],
      dodTemplate: '- [ ] done',
      cardPrefixes: ['GM'],
      nextCardNumbers: { GM: 4 },
    }
    withRaw(JSON.stringify({ boards: [current] }))
    const { boards } = await readConfigFile('/repo')
    expect(boards[0]).toMatchObject(current)
  })
})

describe('writeConfigFile', () => {
  it('writes indented JSON, so the committed file diffs line by line', async () => {
    await writeConfigFile('/repo', { boards: [] })
    expect(writeBoardConfig).toHaveBeenCalledWith('/repo', JSON.stringify({ boards: [] }, null, 2))
  })
})

describe('generateBoardId', () => {
  /**
   * The id is embedded in every card's label (`board:<id>:status:<col>`), which has to fit under
   * GitHub's 50-character limit alongside the column id — so its length is a real constraint, not a
   * preference.
   */
  it('produces a short, label-safe id', () => {
    const id = generateBoardId()
    expect(id).toMatch(/^[0-9a-f]{1,8}$/)
  })
})
