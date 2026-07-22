import { describe, it, expect, beforeEach } from 'vitest'
import { useActivityLogStore } from './activityLog.store'

function reset() {
  useActivityLogStore.setState({ entries: [] })
}

function addEntry(command: string) {
  useActivityLogStore.getState().add({ command, durationMs: 1, status: 'ok' })
}

describe('useActivityLogStore', () => {
  beforeEach(reset)

  it('adds entries newest-first with a generated id and timestamp', () => {
    addEntry('first')
    addEntry('second')
    const { entries } = useActivityLogStore.getState()
    expect(entries.map((e) => e.command)).toEqual(['second', 'first'])
    expect(entries[0].id).toBeTruthy()
    expect(entries[0].id).not.toBe(entries[1].id)
    expect(entries[0].timestamp).toBeGreaterThan(0)
  })

  it('preserves correlation and repo metadata on entries', () => {
    useActivityLogStore.getState().add({
      command: 'pull',
      durationMs: 5,
      status: 'ok',
      repoPath: '/tmp/repo',
      correlationId: 'corr-1',
      correlationLabel: 'git.pull',
    })
    const entry = useActivityLogStore.getState().entries[0]
    expect(entry.repoPath).toBe('/tmp/repo')
    expect(entry.correlationId).toBe('corr-1')
    expect(entry.correlationLabel).toBe('git.pull')
  })

  it('caps the buffer at 1000 entries, dropping the oldest', () => {
    for (let i = 0; i < 1005; i++) addEntry(`cmd-${i}`)
    const { entries } = useActivityLogStore.getState()
    expect(entries).toHaveLength(1000)
    expect(entries[0].command).toBe('cmd-1004') // newest kept
    expect(entries[entries.length - 1].command).toBe('cmd-5') // cmd-0..4 evicted
  })

  it('clears all entries', () => {
    addEntry('x')
    useActivityLogStore.getState().clear()
    expect(useActivityLogStore.getState().entries).toEqual([])
  })
})
