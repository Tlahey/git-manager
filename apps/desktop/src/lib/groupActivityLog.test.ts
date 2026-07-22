import { describe, it, expect } from 'vitest'
import type { ActivityLogEntry } from '../stores/activityLog.store'
import { groupActivityLog } from './groupActivityLog'

let counter = 0
function entry(overrides: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
  counter += 1
  return {
    id: `e${counter}`,
    timestamp: 1000 + counter,
    command: 'get_log',
    durationMs: 1,
    status: 'ok',
    ...overrides,
  }
}

describe('groupActivityLog', () => {
  it('groups consecutive entries sharing a correlationId into one block', () => {
    const entries = [
      entry({ correlationId: 'c1', correlationLabel: 'git.commit', durationMs: 3 }),
      entry({ correlationId: 'c1', correlationLabel: 'git.commit', durationMs: 2 }),
    ]
    const blocks = groupActivityLog(entries, 'application', null)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].id).toBe('c1')
    expect(blocks[0].label).toBe('git.commit')
    expect(blocks[0].entries).toHaveLength(2)
    expect(blocks[0].totalDurationMs).toBe(5)
  })

  it('makes each uncorrelated entry its own singleton block', () => {
    const entries = [entry(), entry()]
    const blocks = groupActivityLog(entries, 'application', null)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].label).toBeUndefined()
    expect(blocks[0].id).toBe(blocks[0].entries[0].id)
  })

  it('does not merge non-adjacent entries that share a correlationId', () => {
    const entries = [
      entry({ correlationId: 'c1' }),
      entry({ correlationId: 'c2' }),
      entry({ correlationId: 'c1' }),
    ]
    const blocks = groupActivityLog(entries, 'application', null)
    expect(blocks).toHaveLength(3)
  })

  it('records the earliest timestamp as the block start', () => {
    const entries = [
      entry({ correlationId: 'c1', timestamp: 5000 }),
      entry({ correlationId: 'c1', timestamp: 4000 }),
    ]
    const blocks = groupActivityLog(entries, 'application', null)
    expect(blocks[0].startTimestamp).toBe(4000)
  })

  it('keeps only the active repo entries in repository scope', () => {
    const entries = [
      entry({ repoPath: '/a', command: 'pull' }),
      entry({ repoPath: '/b', command: 'push' }),
    ]
    const blocks = groupActivityLog(entries, 'repository', '/a')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].entries[0].command).toBe('pull')
  })

  it('yields nothing in repository scope when no repo is active', () => {
    const entries = [entry({ repoPath: '/a' })]
    expect(groupActivityLog(entries, 'repository', null)).toEqual([])
  })
})
